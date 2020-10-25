
const util = require('util'); 

// generates a range of numbers from start (inclusive) to end (exclusive)
function* range(start: number, end?: number, step: number = 1) {
  if( end === undefined ) [start, end] = [0, start];
  for( let n = start; n < end; n += step ) yield n;
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
    cells: Array<Cell>;
    links: Array<Link>;

    constructor(id: HintId, value: number) {
        this.id = id;
        this.value = value;
        this.cells = new Array();
        this.links = new Array();
    }
}

class Cell {
    id: CellId;
    hints: Array<Hint>;
    links: Array<Link>;
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
    hint: Hint | undefined;
    cells: Array<Cell>;
    state: State;

    constructor(id: LinkId) {
        this.id = id;
        this.chain_id = id;
        this.hint = undefined;
        this.cells = new Array();
        this.state = State.Unknown;
    }
}

interface Action {
    execute(grid: Grid): void;
}

function reason(label: string, id: any): string {
    return label + ': ' + JSON.stringify(id);
}

class SetCellState implements Action {
    cell: Cell;
    new_state: State;
    reason: string;

    constructor(cell: Cell, new_state: State, reason: string) {
        this.cell = cell;
        this.new_state = new_state;
        this.reason = reason;
    }

    execute(grid: Grid) {
        console.log('cell ' + JSON.stringify(this.cell.id) + ' -> ' + this.new_state + '; ' + this.reason);
        this.cell.state = this.new_state;

        const [_live_links, unknown_links, _dead_links]: [Array<Link>, Array<Link>, Array<Link>] = split_links(this.cell.links);
        for(const link of unknown_links) {
            grid.dirty_links.add(link);
        }
        for(const hint of this.cell.hints) {
            grid.dirty_hints.add(hint);
        }
        grid.dirty_cells.add(this.cell);
    }
}

class SetLinkState implements Action {
    link: Link;
    new_state: State;
    reason: string;

    constructor(link: Link, new_state: State, reason: string) {
        this.link = link;
        this.new_state = new_state;
        this.reason = reason;
    }

    execute(grid: Grid) {
        console.log('link ' + JSON.stringify(this.link.id) + ' -> ' + this.new_state + '; ' + this.reason);
        this.link.state = this.new_state;

        const [live_cells, unknown_cells, _dead_cells] = split_cells(this.link.cells);
        for(const cell of unknown_cells) {
            grid.dirty_cells.add(cell);
        }
        if(this.link.hint) {
            grid.dirty_hints.add(this.link.hint);
        }
        for(const cell of live_cells) {
            grid.dirty_cells.add(cell);
            this.propagate_chain_id(grid, cell, this.link.chain_id);
        }
        grid.dirty_links.add(this.link);
    }

    // For every connected live link, set its chain id to match
    propagate_chain_id(grid: Grid, cell: Cell, chain_id: LinkId) {
        const [live_links, _unknown_links, _dead_links] = split_links(cell.links);
        for(const link of live_links) {
            if(link.chain_id == chain_id) {
                continue;
            }
            link.chain_id = chain_id;
            grid.dirty_links.add(link);
            grid.dirty_cells.add(cell);

            for(const neighbor of link.cells) {
                this.propagate_chain_id(grid, neighbor, chain_id);
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
    const [live_cells, unknown_cells, dead_cells] = split_cells(hint.cells);

    if(unknown_cells.length > 0) {
        if(live_cells.length == hint.value) {
            return unknown_cells.map(cell => new SetCellState(cell, State.Dead, reason("hint erasure", hint.id)));
        }

        if(live_cells.length + unknown_cells.length == hint.value) {
            return unknown_cells.map(cell => new SetCellState(cell, State.Live, reason("hint completion", hint.id)));
        }

        if(live_cells.length + unknown_cells.length == hint.value - 1) {
            const [live_links, unknown_links, dead_links] = split_links(hint.links);
            if(unknown_links.length > 0) {
                return unknown_links.map(link => new SetLinkState(link, State.Dead, reason("hint restriction", hint.id)));
            }
        }
    }

    return [];
}

function process_link(grid: Grid, link: Link) : Array<Action> {
    if(link.state == State.Unknown) {
        const [live_cells, _unknown_cells, _dead_cells] = split_cells(link.cells);
        const neighbor_links = live_cells.flatMap(cell => cell.links);
        const [live_neighbor_links, _unknown_neighbor_links, _dead_neighbor_links] = split_links(neighbor_links);
        const neighbor_chain_ids = new Set(live_neighbor_links.map(link => link.chain_id));

        if(neighbor_chain_ids.size < live_neighbor_links.length) {
            return [new SetLinkState(link, State.Dead, reason("closed loop", link.id))];
        }
    }

    return [];
}

function process_cell(grid: Grid, cell: Cell) : Array<Action> {
    const [live_links, unknown_links, dead_links] = split_links(cell.links);

    if(live_links.length > 0 && cell.state == State.Dead) {
        return [new Fail()];
    }

    if(unknown_links.length > 0) {
        if(cell.state == State.Dead) {
            return unknown_links.map(link => new SetLinkState(link, State.Dead, reason("dead cell erasure", cell.id)));
        }

        if(live_links.length == 2) {
            return unknown_links.map(link => new SetLinkState(link, State.Dead, reason("completed cell erasure", cell.id)));
        }

        if(cell.state == State.Live && unknown_links.length + live_links.length == 2) {
            return unknown_links.map(link => new SetLinkState(link, State.Live, reason("cell completion", cell.id)));
        }
    }

    if(cell.state == State.Unknown) {
        if(dead_links.length >= 3) {
            return [new SetCellState(cell, State.Dead, reason("cell extinguishment", cell.id))];
        }

        if(live_links.length > 0) {
            return [new SetCellState(cell, State.Live, reason("cell ignition", cell.id))];
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
        this.cells.set(JSON.stringify(pos), new Cell(pos));
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
        this.links.set(JSON.stringify(link_id), new Link(link_id));
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
        this.hints.set(JSON.stringify(hint_id), new Hint(hint_id, value));

        switch(hint_id.direction) {
            case Direction.South:
                const x = hint_id.index;
                for(const y of range(this.ymax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, { pos, direction: Direction.South });
                }
                break;
            case Direction.East:
                const y = hint_id.index;
                for(const x of range(this.xmax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, { pos, direction: Direction.East });
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
            cell.links.push(link);
            link.cells.push(cell);
        }
    }

    try_connect_hint_with_cell(hint_id: HintId, cell_id: CellId) {
        const hint_key = JSON.stringify(hint_id); // omg
        const cell_key = JSON.stringify(cell_id); // omg

        const hint = this.hints.get(hint_key);
        const cell = this.cells.get(cell_key);

        if(hint && cell) {
            hint.cells.push(cell);
            cell.hints.push(hint);
        }
    }

    try_connect_hint_with_link(hint_id: HintId, link_id: LinkId) {
        const hint_key = JSON.stringify(hint_id); // omg
        const link_key = JSON.stringify(link_id); // omg

        const hint = this.hints.get(hint_key);
        const link = this.links.get(link_key);

        if(hint && link) {
            hint.links.push(link);
            link.hint = hint;
        }
    }

    build() : Grid {
        return new Grid(Array.from(this.cells.values()), Array.from(this.links.values()), Array.from(this.hints.values()));
    }
}

class Grid {
    dirty_cells: Set<Cell>;
    dirty_links: Set<Link>;
    dirty_hints: Set<Hint>;
    cells: Array<Cell>;
    links: Array<Link>;
    hints: Array<Hint>;

    constructor(cells: Array<Cell>,
                links: Array<Link>,
                hints: Array<Hint>) {
        this.dirty_cells = new Set(cells);
        this.dirty_links = new Set(links);
        this.dirty_hints = new Set(hints);
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
            console.log('.');
        }
    }

    process() : Array<Action> {
        const grid = this;
        function loop_process<T>(source: Set<T>, process_function: (grid: Grid, thing: T) => Array<Action>) {
            for(const value of source) {
                source.delete(value);
                const result = process_function(grid, value);
                if(result.length) {
                    return result;
                }
            }
            return undefined;
        }

        return undefined
          || loop_process(this.dirty_hints, process_hint)
          || loop_process(this.dirty_cells, process_cell)
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
        }
    }

    // add links
    for(const y of range(zy)) {
        for(const x of range(zx)) {
            const pos = { x, y };
            if(y > 0) {
                builder.add_link({ pos, direction: Direction.East });
            }

            if(x > 0) {
                builder.add_link({ pos, direction: Direction.South });
            }
        }
    }

    // add hints
    hints_north_south.forEach((hint, index) => {
        builder.add_hint({ index: index + 1, direction: Direction.South }, hint);
    });

    // add hints
    hints_east_west.forEach((hint, index) => {
        builder.add_hint({ index: index + 1, direction: Direction.East }, hint);
    });

    // set some links Live as requested
    for(const link_id of live_links) {
        builder.links.get(JSON.stringify(link_id))!.state = State.Live;
    }

    // mark all other edge links as Dead
    for(const link of builder.links.values()) {
        if(link.state == State.Unknown && link.cells.length == 1) {
            link.state = State.Dead;
        }
    }

    return builder.build();
}

function split_cells(cells: Array<Cell>) : [Array<Cell>, Array<Cell>, Array<Cell>] {
    const result: [Array<Cell>, Array<Cell>, Array<Cell>] = [new Array(), new Array(), new Array()];

    for(const cell of cells) {
        switch(cell.state) {
            case State.Live:    result[0].push(cell); break;
            case State.Unknown: result[1].push(cell); break;
            case State.Dead:    result[2].push(cell); break;
        }
    }

    return result;
}

function split_links(links: Array<Link>) : [Array<Link>, Array<Link>, Array<Link>] {
    const result: [Array<Link>, Array<Link>, Array<Link>] = [new Array(), new Array(), new Array()];

    for(const link of links) {
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

function describe_grid(grid: Grid): string {
    let output = '';

    const [live_cells, unknown_cells, dead_cells] = split_cells(grid.cells);
    output += 'cell counts: (' + live_cells.length + ', ' + unknown_cells.length + ', ' + dead_cells.length + ')\n';

    const [live_links, unknown_links, dead_links] = split_links(grid.links);
    output += 'link counts: (' + live_links.length + ', ' + unknown_links.length + ', ' + dead_links.length + ')\n';

    return output;
}

function main() {
    function link(x: Index, y: Index, south: boolean): LinkId {
        return { pos: { x, y }, direction: south ? Direction.South : Direction.East };
    }

    /*
    const grid = make_grid(4, 4, [
            { pos: { x: 1, y: 1 }, direction: Direction.South },
            { pos: { x: 0, y: 2 }, direction: Direction.East },
            { pos: { x: 1, y: 4 }, direction: Direction.East },
            { pos: { x: 2, y: 4 }, direction: Direction.South }
        ],
        [4,3,3,2],
        [4,3,3,2]
    );
    */

    // 8x8:n9a5a3g5a9k3i5hCd,7,8,8,S7,6,4,5,2,8,7,S5,6,7,5,5,4
    const grid = make_grid(8, 8, [
            link(0, 3, false),
            link(1, 3, false),
            link(1, 6, false),
            link(2, 4, false),
            link(2, 7, false),
            link(3, 3, false),
            link(3, 4, false),
            link(3, 7, false),
            link(3, 8, false),
            link(5, 4, false),
            link(7, 2, false),
            link(1, 5, true),
            link(3, 2, true),
            link(4, 8, true),
            link(5, 4, true),
            link(7, 2, true)
        ],
        [7,8,8,7,6,4,5,2],
        [8,7,5,6,7,5,5,4]
    );

    console.log(describe_grid(grid));

    grid.solve();

    console.log();
    console.log(describe_grid(grid));
}

main();
