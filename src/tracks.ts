
const util = require('util'); 

// generates a range of numbers from start (inclusive) to end (exclusive)
function* range(start: number, end?: number, step: number = 1) {
  if( end === undefined ) [start, end] = [0, start];
  for( let n = start; n < end; n += step ) yield n;
}

function setSet<K>(collection: Map<string, K>, entry: K) {
    collection.set(JSON.stringify(entry), entry);
}

function mapGet<K, V>(collection: Map<string, V>, key: K): V {
    return collection.get(JSON.stringify(key));
}

function mapSet<K, V>(collection: Map<string, V>, key: K, value: V) {
    collection.set(JSON.stringify(key), value);
}

enum Direction {
    East,
    South,
}

type Index = number;

type Pos = {
    x: Index,
    y: Index
};

function south(pos: Pos) : Pos {
    return { x: pos.x, y: pos.y + 1 };
}

function east(pos: Pos) : Pos {
    return { x: pos.x + 1, y: pos.y };
}

function north(pos: Pos) : Pos {
    return { x: pos.x, y: pos.y - 1 };
}

function west(pos: Pos) : Pos {
    return { x: pos.x - 1, y: pos.y };
}

type HintId = {
    index: Index,
    direction: Direction
};

type CellId = Pos;

type LinkId = {
    pos: Pos,
    direction: Direction
};

enum State {
    Live,
    Unknown,
    Dead,
}

class Hint {
    id: HintId;
    value: number;
    cells: Array<CellId>;
    links: Array<LinkId>;

    constructor(id: HintId, value: number) {
        this.id = id;
        this.value = value;
        this.cells = new Array();
        this.links = new Array();
    }
}

class Cell {
    id: CellId;
    hints: Array<HintId>;
    links: Array<LinkId>;
    state: State;

    constructor(id: CellId) {
        this.id = id;
        this.hints = new Array();
        this.links = new Array();
        this.state = State.Unknown;
    }
}

class Link {
    id: LinkId;
    chain_id: LinkId;
    hint_id: HintId | undefined;
    cells: Array<CellId>;
    state: State;

    constructor(id: LinkId) {
        this.id = id;
        this.chain_id = id;
        this.hint_id = undefined;
        this.cells = new Array();
        this.state = State.Unknown;
    }
}

interface Action {
    execute(grid: Grid): void;
}

class SetCellState implements Action {
    cell_id: CellId;
    new_state: State;

    constructor(cell_id: CellId, new_state: State) {
        this.cell_id = cell_id;
        this.new_state = new_state;
    }

    execute(grid: Grid) {
        const cell = mapGet(grid.cells, this.cell_id)!;
        cell.state = this.new_state;

        const [_live_links, unknown_links, _dead_links]: [Array<Link>, Array<Link>, Array<Link>] = get_links(grid.links, cell.links);
        for(const link of unknown_links) {
            setSet(grid.dirty_links, link.id);
        }
        for(const hint_id of cell.hints) {
            setSet(grid.dirty_hints, hint_id);
        }
    }
}

class SetLinkState implements Action {
    link_id: LinkId;
    new_state: State;

    constructor(link_id: LinkId, new_state: State) {
        this.link_id = link_id;
        this.new_state = new_state;
    }

    execute(grid: Grid) {
        const link = mapGet(grid.links, this.link_id)!;
        link.state = this.new_state;

        const [live_cells, unknown_cells, _dead_cells] = get_cells(grid.cells, link.cells);
        for(const cell of unknown_cells) {
            setSet(grid.dirty_cells, cell.id);
        }
        if(link.hint_id) {
            setSet(grid.dirty_hints, link.hint_id);
        }
        for(const cell of live_cells) {
            setSet(grid.dirty_cells, cell.id);
            this.propagate_chain_id(grid, cell, link.chain_id);
        }
    }

    // For every connected live link, set its chain id to match
    propagate_chain_id(grid: Grid, cell: Cell, chain_id: LinkId) {
        const [live_links, _unknown_links, _dead_links] = get_links(grid.links, cell.links);
        for(const link of live_links) {
            if(link.chain_id == chain_id) {
                continue;
            }
            link.chain_id = chain_id;
            setSet(grid.dirty_links, link.id);
            setSet(grid.dirty_cells, cell.id);

            for(const neighbor_id of link.cells) {
                this.propagate_chain_id(grid, mapGet(grid.cells, neighbor_id)!, chain_id);
            }
        }
    }
}

class Fail implements Action {
    execute(grid: Grid) {
        throw new Error("failure executed!");
    }
}

function process_hint(grid: Grid, hint: Hint) : Array<Action> {
    const [live_cells, unknown_cells, dead_cells] = get_cells(grid.cells, hint.cells);

    if(unknown_cells.length > 0) {
        if(live_cells.length == hint.value) {
            return unknown_cells.map(cell => new SetCellState(cell.id, State.Dead));
        }

        if(live_cells.length + unknown_cells.length == hint.value) {
            return unknown_cells.map(cell => new SetCellState(cell.id, State.Live));
        }

        if(live_cells.length + unknown_cells.length == hint.value - 1) {
            const [live_links, unknown_links, dead_links] = get_links(grid.links, hint.links);
            if(unknown_links.length > 0) {
                return unknown_links.map(link => new SetLinkState(link.id, State.Dead));
            }
        }
    }

    return [];
}

function process_link(grid: Grid, link: Link) : Array<Action> {
    if(link.state == State.Unknown) {
        const [live_cells, _unknown_cells, _dead_cells] = get_cells(grid.cells, link.cells);
        const neighbor_link_ids = live_cells.flatMap(cell => cell.links);
        const [live_neighbor_links, _unknown_neighbor_links, _dead_neighbor_links] = get_links(grid.links, neighbor_link_ids);
        const neighbor_chain_ids = new Set(live_neighbor_links.map(link => link.chain_id));

        if(neighbor_chain_ids.size < live_neighbor_links.length) {
            return [new SetLinkState(link.id, State.Dead)]; // closed loop rule
        }
    }

    return [];
}

function process_cell(grid: Grid, cell: Cell) : Array<Action> {
    const [live_links, unknown_links, dead_links] = get_links(grid.links, cell.links);

    if(live_links.length == 1 && cell.state == State.Dead) {
        return [new Fail()];
    }

    if(unknown_links.length > 0) {
        if(cell.state == State.Dead || live_links.length == 2) {
            return unknown_links.map(link => new SetLinkState(link.id, State.Dead));
        }

        if(cell.state == State.Live && unknown_links.length <= 2) {
            return unknown_links.map(link => new SetLinkState(link.id, State.Live));
        }
    }

    if(cell.state == State.Unknown) {
        if(dead_links.length >= 3) {
            return [new SetCellState(cell.id, State.Dead)];
        }

        if(live_links.length > 0) {
            return [new SetCellState(cell.id, State.Live)];
        }
    }

    return [];
}

class GridBuilder {
    cells: Map<string, Cell>;
    links: Map<string, Link>;
    hints: Map<string, Hint>;
    xmax: Index;
    ymax: Index;

    constructor(xmax: Index, ymax: Index) {
        this.cells = new Map();
        this.links = new Map();
        this.hints = new Map();
        this.xmax = xmax;
        this.ymax = ymax;
    }

    add_cell(pos: Pos) {
        mapSet(this.cells, pos, new Cell(pos));
        this.xmax = Math.max(this.xmax, pos.x);
        this.ymax = Math.max(this.ymax, pos.y);

        this.try_connect_cell_with_link(pos, { pos, direction: Direction.East });
        this.try_connect_cell_with_link(pos, { pos: west(pos), direction: Direction.East });
        this.try_connect_cell_with_link(pos, { pos, direction: Direction.South });
        this.try_connect_cell_with_link(pos, { pos: north(pos), direction: Direction.South });

        this.try_connect_hint_with_cell({ index: pos.y, direction: Direction.East }, pos);
        this.try_connect_hint_with_cell({ index: pos.x, direction: Direction.South }, pos);
    }

    add_link(link_id: LinkId) {
        mapSet(this.links, link_id, new Link(link_id));
        console.log(util.inspect([link_id, mapGet(this.links, link_id)], { depth: 4}));
        mapGet(console.log(util.inspect(this.links, { pos: { x: 1, y: 1 }, direction: 1 }), { depth: 4}));

        this.xmax = Math.max(this.xmax, link_id.pos.x);
        this.ymax = Math.max(this.ymax, link_id.pos.y);

        this.try_connect_cell_with_link(link_id.pos, link_id);
        switch(link_id.direction) {
            case Direction.East:
                this.try_connect_cell_with_link(east(link_id.pos), link_id);
                this.try_connect_hint_with_link({ index: link_id.pos.y, direction: Direction.East }, link_id);
                break;
            case Direction.South:
                this.try_connect_cell_with_link(south(link_id.pos), link_id);
                this.try_connect_hint_with_link({ index: link_id.pos.x, direction: Direction.South }, link_id);
                break;
        }
    }

    add_hint(hint_id: HintId, value: number) {
        mapSet(this.hints, hint_id, new Hint(hint_id, value));

        switch(hint_id.direction) {
            case Direction.East:
                const x = hint_id.index;
                for(const y of range(this.ymax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, { pos, direction: Direction.East });
                }
                break;
            case Direction.South:
                const y = hint_id.index;
                for(const x of range(this.xmax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, { pos, direction: Direction.South });
                }
                break;
        }
    }

    try_connect_cell_with_link(cell_id: CellId, link_id: LinkId) {
        const link_key = JSON.stringify(link_id); // omg
        const cell_key = JSON.stringify(cell_id); // omg

        const cell = this.cells.get(cell_key);
        const link = this.links.get(link_key);
        if(cell && link) {
            cell.links.push(link_key);
            link.cells.push(cell_key);
        }
    }

    try_connect_hint_with_cell(hint_id: HintId, cell_id: CellId) {
        const hint_key = JSON.stringify(hint_id); // omg
        const cell_key = JSON.stringify(cell_id); // omg

        const hint = this.hints.get(hint_key);
        const cell = this.cells.get(cell_key);

        if(hint && cell) {
            hint.cells.push(cell_key);
            cell.hints.push(hint_key);
        }
    }

    try_connect_hint_with_link(hint_id: HintId, link_id: LinkId) {
        const hint_key = JSON.stringify(hint_id); // omg
        const link_key = JSON.stringify(link_id); // omg

        const hint = this.hints.get(hint_key);
        const link = this.links.get(link_key);

        if(hint && link) {
            hint.links.push(link_key);
            link.hint_id = hint_id;
        }
    }

    build() : Grid {
        const dirty_cells = new Map(this.cells.values().map(cell => [JSON.stringify(cell.id), cell.id]));
        const dirty_links = new Map(this.links.keys().map(link => [JSON.stringify(link.id), link.id]));
        const dirty_hints = new Map(this.hints.keys().map(hint => [JSON.stringify(hint.id), hint.id]));
        return new Grid(dirty_cells, dirty_links, dirty_hints, this.cells, this.links, this.hints);
    }
}

class Grid {
    dirty_cells: Map<string, CellId>;
    dirty_links: Map<string, LinkId>;
    dirty_hints: Map<string, HintId>;
    cells: Map<string, Cell>;
    links: Map<string, Link>;
    hints: Map<string, Hint>;

    constructor(dirty_cells: Map<string, CellId>,
                dirty_links: Map<string, LinkId>,
                dirty_hints: Map<string, HintId>,
                cells: Map<string, Cell>,
                links: Map<string, Link>,
                hints: Map<string, Hint>) {
        this.dirty_cells = dirty_cells;
        this.dirty_links = dirty_links;
        this.dirty_hints = dirty_hints;
        this.cells = cells;
        this.links = links;
        this.hints = hints;
    }

    solve() {
        while(true) {
            const actions = this.process();
            if(!actions.length) {
                break;
            }

            for(const action of actions) {
                action.execute(this);
            }
        }
    }

    process() : Array<Action> {
        const grid = this;
        function loop_process(id_source: Map<string, any>, data_source: Map<string, any>, process_function: (grid: Grid, thing: any) => Array<Action>) {
            for(const [key, value] of id_source.entries()) {
                id_source.delete(key);
                const data = data_source.get(key)!;
                const result = process_function(grid, data);
                if(result.length) {
                    return result;
                }
            }
            return undefined;
        }

        return loop_process(this.dirty_cells, process_cell)
          || loop_process(this.dirty_hints, process_hint)
          || loop_process(this.dirty_links, process_link)
          || [];
    }
}

function make_grid(cx: Index, cy: Index, live_links: Array<LinkId>, hints_north_south: Array<number>, hints_east_west: Array<number>): Grid {
    const zx = cx + 1;
    const zy = cy + 1;

    const builder = new GridBuilder(cx, cy);

    // add cells
    for(const y of range(1, zy)) {
        for(const x of range(1, zx)) {
            builder.add_cell({ x, y });
            console.log(JSON.stringify({ x, y }));
        }
    }

    // add links
    for(const y of range(zy)) {
        for(const x of range(zx)) {
            const pos = { x, y };
            if(y > 0) {
                builder.add_link({ pos, direction: Direction.East });
                console.log(JSON.stringify({ pos, direction: Direction.East }));
            }

            if(x > 0) {
                builder.add_link({ pos, direction: Direction.South });
            }
        }
    }

    // add hints
    hints_north_south.forEach((hint, index) => {
        builder.add_hint({ index: index + 1, direction: Direction.South }, hint);
        console.log(JSON.stringify({ index: index + 1, direction: Direction.South }));
    });

    // add hints
    hints_east_west.forEach((hint, index) => {
        builder.add_hint({ index: index + 1, direction: Direction.East }, hint);
    });

    //console.log('%O', builder);
    //console.log(JSON.stringify(builder, null, 4));
    console.log('----');
    console.log(util.inspect(builder, { depth: 4 }));
    console.log('----');
    console.log(util.inspect(builder.links.keys(), { depth: 4 }));
    console.log('----');

    // set some links Live as requested
    for(const link_id of live_links) {
        console.log(util.inspect(link_id));
        mapGet(builder.links, link_id)!.state = State.Live;
    }

    return builder.build();
}

function get_cells(cells: Map<string, Cell>, cell_ids: Array<CellId>) : [Array<Cell>, Array<Cell>, Array<Cell>] {
    const result: [Array<Cell>, Array<Cell>, Array<Cell>] = [new Array(), new Array(), new Array()];

    for(const cell_id of cell_ids) {
        const cell = mapGet(cells, cell_id)!;

        switch(cell.state) {
            case State.Live:    result[0].push(cell); break;
            case State.Unknown: result[1].push(cell); break;
            case State.Dead:    result[2].push(cell); break;
        }
    }

    return result;
}

function get_links(links: Map<string, Link>, link_ids: Array<LinkId>) : [Array<Link>, Array<Link>, Array<Link>] {
    const result: [Array<Link>, Array<Link>, Array<Link>] = [new Array(), new Array(), new Array()];

    for(const link_id of link_ids) {
        const link = mapGet(links, link_id)!;

        switch(link.state) {
            case State.Live:    result[0].push(link); break;
            case State.Unknown: result[1].push(link); break;
            case State.Dead:    result[2].push(link); break;
        }
    }

    return result;
}


/*
elaborate:
 - odd/even
 - "if we light this link, we'll need to light these other ones, and a hint will over/underflow"
 - "if this cell goes dead, then the one in the corner next to it will need to be dead too"
 - "the hint says 5, we've lit 3, and we have a single and a double -- so we have to light the double not the single"
 - random guesses
*/

/*
if a row can accept only one more cross,
  and a cell in that row has only two maybe-links,
  and one of those maybe-links is in the hint,
  then the other cell in that link is Live.

odd/even:
 - starting set: every Maybe link on a Live cell.
 - discard any which can reach multiple Maybe links on that live Cell without crossing the cell.

other advanced rule:
 - when we can only just reach
*/

function main() {
    console.log("omg\n");
    //static make_grid(cx: Index, cy: Index, live_links: Array<[Pos, Direction]>, hints: Array<[Index, Direction]>): Grid {
    const grid = make_grid(4, 4, [
            { pos: { x: 1, y: 1 }, direction: Direction.South },
            { pos: { x: 0, y: 2 }, direction: Direction.East },
            { pos: { x: 1, y: 4 }, direction: Direction.East },
            { pos: { x: 2, y: 4 }, direction: Direction.South }
        ],
        [4,3,3,2],
        [4,3,3,2]
    );
    grid.solve();
    console.log('%O', grid);
}

main();
