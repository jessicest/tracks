
function main() {
    console.log("Hello, world!");
}

function* range( start, end, step = 1 ){
  if( end === undefined ) [start, end] = [0, start];
  for( let n = start; n <= end; n += step ) yield n;
}

enum Direction {
    East,
    South,
}

class Pos {
    x: bigint;
    y: bigint;

    constructor(x: bigint, y: bigint) {
        this.x = x;
        this.y = y;
    }

    function south() : Pos {
        return new Pos(this.x, this.y + 1);
    }

    function east() : Pos {
        return new Pos(this.x + 1, this.y);
    }

    function north() : Pos {
        return new Pos(this.x, this.y - 1);
    }

    function west() : Pos {
        return new Pos(this.x - 1, this.y);
    }
}

type HintId = [bigint, Direction];
type CellId = Pos;
type LinkId = [Pos, Direction];

enum State {
    Live,
    Unknown,
    Dead,
}

class Hint {
    id: HintId;
    value: bigint;
    cells: Array<CellId>;
    links: Array<LinkId>;

    constructor(id: HintId, value: bigint) {
        this.id = id;
        this.value = value;
        this.cells = new Array();
        this.links = new Array();
    }
}

class Cell {
    id: CellId,
    hints: Array<HintId>,
    links: Array<LinkId>,
    state: State,

    constructor(id: CellId) {
        this.id = id;
        this.hints = new Array();
        this.links = new Array();
        this.state = Unknown;
    }
}

class Link {
    id: LinkId;
    chain_id: LinkId;
    hint_id: HintId | null;
    cells: Array<CellId>;
    state: State;

    constructor(id: LinkId) {
        this.id = id;
        this.chain_id = id;
        this.hint_id = null;
        this.cells = new Array();
        this.state = Unknown;
    }
}

interface Action {
    function execute(grid: Grid);
}

class SetCellState extends Action {
    cell_id: CellId;
    new_state: State;

    function execute(grid: Grid) {
        const cell = grid.cells.get(this.cell_id);
        cell.state = this.new_state;

        const [_, unknown_links, _] = get_links(grid.links, cell.links);
        for(const link in unknown_links) {
            grid.dirty_links.add(link.id);
        }
        for(const hint_id in cell.hints) {
            grid.dirty_hints.add(hint_id);
        }
    }
}

class SetLinkState extends Action {
    link_id: LinkId;
    new_state: State;

    function execute(grid: Grid) {
        const link = grid.links.get(this.link_id);
        link.state = this.new_state;

        const [live_cells, unknown_cells, _] = get_cells(grid.cells, link.cells);
        for(const cell in unknown_cells) {
            grid.dirty_cells.add(cell.id);
        }
        if(link.hint_id.is_some()) {
            grid.dirty_hints.add(link.hint_id.unwrap());
        }
        for(const cell in live_cells) {
            grid.dirty_cells.add(cell.id);
            this.propagate_chain_id(grid, cell, link.chain_id);
        }
    }

    // For every connected live link, set its chain id to match
    function propagate_chain_id(grid: Grid, cell: Cell, chain_id: LinkId) {
        const [live_links, _, _] = get_links(grid.links, cell.links);
        for(const link in live_links) {
            if(link.chain_id == chain_id) {
                continue;
            }
            link.chain_id = chain_id;
            grid.dirty_links.add(link.id);
            grid.dirty_cells.add(cell.id);

            for(const neighbor_id in link.cells) {
                propagate_chain_id(grid, grid.cells.get(neighbor_id), chain_id);
            }
        }
    }
}

class Fail extends Action {
    function execute() {
        throw new Error("failure executed!");
    }
}

function process_hint(grid: Grid, hint: Hint) : Array<Action> {
    const [live_cells, unknown_cells, dead_cells] = get_cells(grid.cells, hint.cells);

    if(unknown_cells.length > 0) {
        if(live_cells.length == hint.value) {
            return unknown_cells.map(cell => new SetCellState(cell.id, Dead));
        }

        if(live_cells.length + unknown_cells.length == hint.value) {
            return unknown_cells.map(cell => new SetCellState(cell.id, Live));
        }

        if(live_cells.length + unknown_cells.length == hint.value - 1) {
            const [live_links, unknown_links, dead_links] = get_links(grid.links, hint.links);
            if(unknown_links.length > 0) {
                return unknown_links.map(link => new SetLinkState(link.id, Dead));
            }
        }
    }

    return [];
}

function process_link(grid: Grid, link: Link) : Array<Action> {
    const [live_cells, _, _] = get_cells(grid.cells, link.cells);
    const neighbor_link_ids = live_cells.flat_map(|cell| cell.links.clone());
    const [live_neighbor_links, _, _] = get_links(grid.links, neighbor_link_ids);

    if(live_neighbor_links.windows(2).any(|w| w[0].chain_id == w[1].chain_id)) {
        return [SetLinkState(link.id, Dead)]; // closed loop rule
    }

    return [];
}

function process_cell(grid: Grid, cell: Cell) : Array<Action> {
    const [live_links, unknown_links, dead_links] = get_links(grid.links, cell.links);

    if(live_links.length == 1 && cell.state == Dead) {
        return [new Fail()];
    }

    if(unknown_links.length > 0) {
        if(cell.state == Dead || live_links.length == 2) {
            return unknown_links.map(link => new SetLinkState(link.id, Dead));
        }

        if(cell.state == Live && unknown_links.length <= 2) {
            return unknown_links.map(link => new SetLinkState(link.id, Live));
        }
    }

    if(cell.state == Unknown) {
        if(dead_links.length >= 3) {
            return [SetCellState(cell.id, Dead)];
        }

        if(live_links.length > 0) {
            return [SetCellState(cell.id, Live)];
        }
    }

    return [];
}

class GridBuilder {
    cells: Map<CellId, Cell>;
    links: Map<LinkId, Link>;
    hints: Map<HintId, Hint>;
    xmax: bigint;
    ymax: bigint;

    constructor(xmax: bigint, ymax: bigint) {
        return {
            cells: new Map(),
            links: new Map(),
            hints: new Map(),
            xmax,
            ymax,
        };
    }

    function add_cell(pos: Pos) {
        this.cells.set(pos, new Cell(pos));
        this.xmax = max(this.xmax, pos.x);
        this.ymax = max(this.ymax, pos.y);

        this.try_connect_cell_with_link(pos, (pos, East));
        this.try_connect_cell_with_link(pos, (pos.west(), East));
        this.try_connect_cell_with_link(pos, (pos, South));
        this.try_connect_cell_with_link(pos, (pos.north(), South));

        this.try_connect_hint_with_cell((pos.y, East), pos);
        this.try_connect_hint_with_cell((pos.x, South), pos);
    }

    function add_link(link_id: LinkId) {
        this.links.set(link_id, new Link(link_id));

        const (pos, direction) = link_id;
        this.xmax = max(this.xmax, pos.x);
        this.ymax = max(this.ymax, pos.y);

        this.try_connect_cell_with_link(pos, link_id);
        switch(direction) {
            case East:
                this.try_connect_cell_with_link(pos.east(), link_id);
                this.try_connect_hint_with_link((pos.y, East), link_id);
                break;
            case South:
                this.try_connect_cell_with_link(pos.south(), link_id);
                this.try_connect_hint_with_link((pos.x, South), link_id);
                break;
        }
    }

    function add_hint(hint_id: HintId, value: bigint) {
        this.hints.set(hint_id, new Hint(hint_id, value));

        const (index, direction) = hint_id;
        switch(direction) {
            case East:
                const x = index;
                for(const y in range(this.ymax + 1)) {
                    const pos = Pos { x, y };
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, (pos, East));
                }
                break;
            case South:
                const y = index;
                for(const x in range(this.xmax + 1)) {
                    const pos = Pos { x, y };
                    this.try_connect_hint_with_cell(hint_id, pos);
                    this.try_connect_hint_with_link(hint_id, (pos, South));
                }
                break;
        }
    }

    function try_connect_cell_with_link(cell_id: CellId, link_id: LinkId) {
        const cell = this.cells.get(cell_id);
        const link = this.links.get(link_id);
        if(cell && link) {
            cell.links.push(link_id);
            link.cells.push(cell_id);
        }
    }

    function try_connect_hint_with_cell(hint_id: HintId, cell_id: CellId) {
        const hint = this.hints.get(hint_id);
        const cell = this.cells.get(cell_id);

        if(hint && cell) {
            hint.cells.push(cell_id);
            cell.hints.push(hint_id);
        }
    }

    function try_connect_hint_with_link(hint_id: HintId, link_id: LinkId) {
        const hint = this.hints.get(hint_id);
        const link = this.links.get(link_id);

        if(hint && link) {
            hint.links.push(link_id);
            link.hint_id = hint_id;
        }
    }

    function build() : Grid {
        return {
            dirty_cells: new Set(...this.cells.keys()),
            dirty_links: new Set(...this.links.keys()),
            dirty_hints: new Set(...this.hints.keys()),
            cells: this.cells,
            hints: this.hints,
            links: this.links,
        };
    }
}

class Grid {
    dirty_cells: Set<CellId>;
    dirty_links: Set<LinkId>;
    dirty_hints: Set<HintId>;
    cells: Map<CellId, Cell>;
    hints: Map<HintId, Hint>;
    links: Map<LinkId, Link>;

    constructor(cx: bigint, cy: bigint, live_links: Array<(Pos, Direction)>, hints: Array<(bigint, Direction)>) {
        const zx = cx + 1;
        const zy = cy + 1;

        const builder = new GridBuilder(cx, cy);

        // add cells
        for(const y in range(1, zy)) {
            for(const x in range(1, zx)) {
                const pos = Pos { x, y };
                builder.add_cell(pos);
            }
        }

        // add links
        for(const y in range(zy)) {
            for(const x in range(zx)) {
                const pos = Pos { x, y };

                if(y > 0) {
                    builder.add_link((pos, East));
                }

                if(x > 0) {
                    builder.add_link((pos, South));
                }
            }
        }

        // add hints
        for(const (index, hint) in hints.enumerate()) {
            builder.add_hint((index + 1, hint[1]), hint[0]);
        }

        // set some links Live as requested
        for(const link_id in live_links) {
            builder.links.get_mut(link_id).unwrap().state = Live;
        }

        builder.build()
    }

    function solve() {
        loop {
            const actions = this.process();
            if(actions.is_empty()) {
                break;
            }

            for(const action in actions) {
                action.execute();
            }
        }
    }

    function process() : Array<Action> {
        function loop_process(source, process_function) {
            for(const value in source) {
                source.delete(value);
                const result = process_function(value);
                if(!result.is_empty()) {
                    return result;
                }
            }
            return null;
        }

        return loop_process(this.dirty_cells, process_cell)
          || loop_process(this.dirty_hints, process_hint)
          || loop_process(this.dirty_links, process_link)
          || [];
    }
}

function get_cells(cells: Map<CellId, Cell>, cell_ids: Array<CellId>) : [Array<Cell>, Array<Cell>, Array<Cell>] {
    const result = (new Array(), new Array(), new Array());

    for(const cell_id in cell_ids) {
        const cell = cells.get(cell_id);

        switch(cell.state) {
            case Live:    result[0].push(cell); break;
            case Unknown: result[1].push(cell); break;
            case Dead:    result[2].push(cell); break;
        }
    }

    return result;
}

function get_links(links: Map<LinkId, Link>, link_ids: Array<LinkId>) : [Array<Link>, Array<Link>, Array<Link>] {
    const result = (new Array(), new Array(), new Array());

    for(const link_id in link_ids) {
        const link = links.get(link_id);

        switch(link.state) {
            case Live:    result[0].push(link); break;
            case Unknown: result[1].push(link); break;
            case Dead:    result[2].push(link); break;
        }
    }

    return result;
}


function parse(input: str) : Grid {
    // sample:
    // 4x4:hCfA,4,3,4,S4,4,4,S3,4 
    // that's a 4x4 grid, with:
    //   top hints 4344
    //   side hints 4344
    //   A in 3rd row, curving west->south
    //   B in 4th col, curving south->north
    //   no other tracks present
    // 
    // (\d+)x(\d+):(live links),(top hints with S marked),(side hints with S marked)
    // live links seem to be 2 chars per link

    // sample:
    // 8x8:p6k9zg9a,3,3,3,5,5,5,S2,2,4,4,S2,2,4,5,5,2
    // that's with:
    //   top hints 33355522
    //   side hints 44224552
    //   A in 3rd row, curving west->north
    //   B in 7th col, curving south->east
    //   pos (3,4) also contains a south->east fragment

    // sample:
    // 4x4:l6bA,2,2,4,S4,2,2,4,S4
    // wow that's hard. live links are actually the same as in the first example

    // sample:
    // 4x4:CkAc,S4,3,3,4,S3,4,3,4

    throw new Error("idk how to read existing track segments");
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
