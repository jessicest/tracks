
function main() {
    const grid = Grid.make_grid();
    grid.solve();
    console.log('%O', grid);
}

function* range( start: number, end?: number, step: number = 1 ) {
  if( end === undefined ) [start, end] = [0, start];
  for( let n = start; n <= end; n += step ) yield n;
}

enum Direction {
    East,
    South,
}

type Index = number;

class Pos {
    x: Index;
    y: Index;

    constructor(x: Index, y: Index) {
        this.x = x;
        this.y = y;
    }

    south() : Pos {
        return new Pos(this.x, this.y + 1);
    }

    east() : Pos {
        return new Pos(this.x + 1, this.y);
    }

    north() : Pos {
        return new Pos(this.x, this.y - 1);
    }

    west() : Pos {
        return new Pos(this.x - 1, this.y);
    }
}

type HintId = [Index, Direction];
type CellId = Pos;
type LinkId = [Pos, Direction];

enum State {
    Live,
    Unknown,
    Dead,
}

class Hint {
    id: HintId;
    value: Index;
    cells: Array<CellId>;
    links: Array<LinkId>;

    constructor(id: HintId, value: Index) {
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
    execute(grid: Grid);
}

class SetCellState implements Action {
    cell_id: CellId;
    new_state: State;

    constructor(cell_id: CellId, new_state: State) {
        this.cell_id = cell_id;
        this.new_state = new_state;
    }

    execute(grid: Grid) {
        const cell = grid.cells.get(this.cell_id)!;
        cell.state = this.new_state;

        const [_live_links, unknown_links, _dead_links]: [Array<Link>, Array<Link>, Array<Link>] = get_links(grid.links, cell.links);
        for(const link of unknown_links) {
            grid.dirty_links.add(link.id);
        }
        for(const hint_id of cell.hints) {
            grid.dirty_hints.add(hint_id);
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
        const link = grid.links.get(this.link_id)!;
        link.state = this.new_state;

        const [live_cells, unknown_cells, _dead_cells] = get_cells(grid.cells, link.cells);
        for(const cell of unknown_cells) {
            grid.dirty_cells.add(cell.id);
        }
        if(link.hint_id) {
            grid.dirty_hints.add(link.hint_id);
        }
        for(const cell of live_cells) {
            grid.dirty_cells.add(cell.id);
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
            grid.dirty_links.add(link.id);
            grid.dirty_cells.add(cell.id);

            for(const neighbor_id of link.cells) {
                this.propagate_chain_id(grid, grid.cells.get(neighbor_id)!, chain_id);
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
    cells: Map<CellId, Cell>;
    links: Map<LinkId, Link>;
    hints: Map<HintId, Hint>;
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
        this.cells.set(pos, new Cell(pos));
        this.xmax = Math.max(this.xmax, pos.x);
        this.ymax = Math.max(this.ymax, pos.y);

        this.try_connect_cell_with_link(pos, [pos, Direction.East]);
        this.try_connect_cell_with_link(pos, [pos.west(), Direction.East]);
        this.try_connect_cell_with_link(pos, [pos, Direction.South]);
        this.try_connect_cell_with_link(pos, [pos.north(), Direction.South]);

        this.try_connect_hint_with_cell([pos.y, Direction.East], pos);
        this.try_connect_hint_with_cell([pos.x, Direction.South], pos);
    }

    add_link(link_id: LinkId) {
        this.links.set(link_id, new Link(link_id));

        const [pos, direction] = link_id;
        this.xmax = Math.max(this.xmax, pos.x);
        this.ymax = Math.max(this.ymax, pos.y);

        this.try_connect_cell_with_link(pos, link_id);
        switch(direction) {
            case Direction.East:
                this.try_connect_cell_with_link(pos.east(), link_id);
                this.try_connect_hint_with_link([pos.y, Direction.East], link_id);
                break;
            case Direction.South:
                this.try_connect_cell_with_link(pos.south(), link_id);
                this.try_connect_hint_with_link([pos.x, Direction.South], link_id);
                break;
        }
    }

    add_hint(hint_id: HintId, value: Index) {
        this.hints.set(hint_id, new Hint(hint_id, value));

        const [index, direction] = hint_id;
        switch(direction) {
            case Direction.East:
                const x = index;
                for(const y of range(this.ymax + 1)) {
                    const pos = new Pos(x, y);
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, [pos, Direction.East]);
                }
                break;
            case Direction.South:
                const y = index;
                for(const x of range(this.xmax + 1)) {
                    const pos = new Pos(x, y);
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, [pos, Direction.South]);
                }
                break;
        }
    }

    try_connect_cell_with_link(cell_id: CellId, link_id: LinkId) {
        const cell = this.cells.get(cell_id);
        const link = this.links.get(link_id);
        if(cell && link) {
            cell.links.push(link_id);
            link.cells.push(cell_id);
        }
    }

    try_connect_hint_with_cell(hint_id: HintId, cell_id: CellId) {
        const hint = this.hints.get(hint_id);
        const cell = this.cells.get(cell_id);

        if(hint && cell) {
            hint.cells.push(cell_id);
            cell.hints.push(hint_id);
        }
    }

    try_connect_hint_with_link(hint_id: HintId, link_id: LinkId) {
        const hint = this.hints.get(hint_id);
        const link = this.links.get(link_id);

        if(hint && link) {
            hint.links.push(link_id);
            link.hint_id = hint_id;
        }
    }

    build() : Grid {
        const dirty_cells = new Set(this.cells.keys());
        const dirty_links = new Set(this.links.keys());
        const dirty_hints = new Set(this.hints.keys());
        return new Grid(dirty_cells, dirty_links, dirty_hints, this.cells, this.links, this.hints);
    }
}

class Grid {
    dirty_cells: Set<CellId>;
    dirty_links: Set<LinkId>;
    dirty_hints: Set<HintId>;
    cells: Map<CellId, Cell>;
    links: Map<LinkId, Link>;
    hints: Map<HintId, Hint>;

    constructor(dirty_cells: Set<CellId>, dirty_links: Set<LinkId>, dirty_hints: Set<HintId>, cells: Map<CellId, Cell>, links: Map<LinkId, Link>, hints: Map<HintId, Hint>) {
        this.dirty_cells = dirty_cells;
        this.dirty_links = dirty_links;
        this.dirty_hints = dirty_hints;
        this.cells = cells;
        this.links = links;
        this.hints = hints;
    }

    static make_grid(cx: Index, cy: Index, live_links: Array<[Pos, Direction]>, hints: Array<[Index, Direction]>): Grid {
        const zx = cx + 1;
        const zy = cy + 1;

        const builder = new GridBuilder(cx, cy);

        // add cells
        for(const y of range(1, zy)) {
            for(const x of range(1, zx)) {
                const pos = new Pos(x, y);
                builder.add_cell(pos);
            }
        }

        // add links
        for(const y of range(zy)) {
            for(const x of range(zx)) {
                const pos = new Pos(x, y);

                if(y > 0) {
                    builder.add_link([pos, Direction.East]);
                }

                if(x > 0) {
                    builder.add_link([pos, Direction.South]);
                }
            }
        }

        // add hints
        hints.forEach((hint, index) => {
            builder.add_hint([index + 1, hint[1]], hint[0]);
        });

        // set some links Live as requested
        for(const link_id of live_links) {
            builder.links.get(link_id)!.state = State.Live;
        }

        return builder.build();
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
        function loop_process(source, process_function) {
            for(const value of source) {
                source.delete(value);
                const result = process_function(value);
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

function get_cells(cells: Map<CellId, Cell>, cell_ids: Array<CellId>) : [Array<Cell>, Array<Cell>, Array<Cell>] {
    const result: [Array<Cell>, Array<Cell>, Array<Cell>] = [new Array(), new Array(), new Array()];

    for(const cell_id of cell_ids) {
        const cell = cells.get(cell_id)!;

        switch(cell.state) {
            case State.Live:    result[0].push(cell); break;
            case State.Unknown: result[1].push(cell); break;
            case State.Dead:    result[2].push(cell); break;
        }
    }

    return result;
}

function get_links(links: Map<LinkId, Link>, link_ids: Array<LinkId>) : [Array<Link>, Array<Link>, Array<Link>] {
    const result: [Array<Link>, Array<Link>, Array<Link>] = [new Array(), new Array(), new Array()];

    for(const link_id of link_ids) {
        const link = links.get(link_id)!;

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
