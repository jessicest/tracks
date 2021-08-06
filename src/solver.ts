
import {
    Cell,
    CellId,
    Direction,
    Grid,
    Hint,
    HintContent,
    Id,
    Index,
    Link,
    LinkContent,
    Node,
    NodeId,
    make_grid,
    make_link_id
} from './grid.js';

export const enum Status {
    Live,
    Unknown,
    Dead,
}

export interface Action {
    execute(solver: Solver): Array<Id>;
}

function output(s: string) {
    console.log(s);
}

function reason(label: string, id: string): string {
    return label + ': ' + id;
}

class RepealCandidacy implements Action {
    id: Id;

    constructor(id: Id) {
        this.id = id;
    }

    execute(solver: Solver): Array<Id> {
        output('clear: ' + this.id);
        solver.candidates.delete(this.id);
        return [this.id];
    }
}

export class SetChain implements Action {
    target: Node;
    chain_id: Id;
    reason: string;

    constructor(target: Node, chain_id: Id, reason: string) {
        this.target = target;
        this.chain_id = chain_id;
        this.reason = reason;
    }

    execute(solver: Solver): Array<Id> {
        output('node ' + this.target.id + ' joins ' + this.chain_id + '; ' + this.reason);
        solver.chains.set(this.target.id, this.chain_id);

        const [live_cells, unknown_cells] = solver.split_cells(this.target.cells);
        const [live_links, unknown_links] = solver.split_links(this.target.links);

        const modified_ids = new Array();

        for(const neighbors of [live_cells, unknown_cells, live_links, unknown_links]) {
            for(const neighbor of neighbors) {
                modified_ids.push(neighbor.node.id);
            }
        }
        for(const id of modified_ids) {
            solver.candidates.add(id);
        }

        return modified_ids;
    }
}

export class SetStatus implements Action {
    node: Node;
    new_status: Status;
    reason: string;

    constructor(node: Node, new_status: Status, reason: string) {
        this.node = node;
        this.new_status = new_status;
        this.reason = reason;
    }

    execute(solver: Solver): Array<Id> {
        output(this.node.id + ' -> ' + this.new_status + '; ' + this.reason);
        const modified_ids = new Array();

        solver.statuses.set(this.node.id, this.new_status);

        const [live_cells, unknown_cells] = solver.split_cells(this.node.cells);
        const [_live_links, unknown_links] = solver.split_links(this.node.links);

        for(const neighbors of [[this], live_cells, unknown_cells, unknown_links, this.node.hints]) {
            for(const neighbor of neighbors) {
                modified_ids.push(neighbor.node.id);
            }
        }

        for(const id of modified_ids) {
            solver.candidates.add(id);
        }
        if(this.new_status == Status.Dead && this.reason != "click") {
            solver.candidates.delete(this.node.id);
        }

        return modified_ids;
    }
}

class Fail implements Action {
    reason: string;

    constructor(reason: string) {
        this.reason = reason;
    }

    execute(solver: Solver): Array<Id> {
        throw new Error("failure executed: " + this.reason);
    }
}

function process_hint(solver: Solver, hint: Hint) : Action | null {
    const [live_cells, unknown_cells] = solver.split_cells(hint.node.cells);

    if(unknown_cells.length > 0) {
        if(live_cells.length == hint.value) {
            return new SetStatus(unknown_cells[0].node, Status.Dead, reason("hint->cell extinction", hint.node.id));
        }

        if(live_cells.length + unknown_cells.length == hint.value) {
            return new SetStatus(unknown_cells[0].node, Status.Live, reason("hint->cell creation", hint.node.id));
        }

        if(live_cells.length == hint.value - 1) {
            const [_live_links, unknown_links] = solver.split_links(hint.node.links);
            for(const link of unknown_links) {
                const [live_neighbors, _unknown_neighbors] = solver.split_cells(link.node.cells);
                if(live_neighbors.length == 0) {
                    return new SetStatus(link.node, Status.Dead, reason("hint->link restriction", hint.node.id));
                }
            }
        }
    }

    return null;
}

function process_link(solver: Solver, link: Link) : Action | null {
    const status = solver.statuses.get(link.node.id);
    const [live_cells, unknown_cells] = solver.split_cells(link.node.cells);

    if(status == Status.Unknown) {
        if(live_cells.length + unknown_cells.length < 2) {
            return new SetStatus(link.node, Status.Dead, reason("cell->link extinguish", link.node.cells[0].node.id));
        }

        if(live_cells.length == 2) {
            const cell_chain_0 = solver.chains.get(live_cells[0].node.id)!;
            const cell_chain_1 = solver.chains.get(live_cells[1].node.id)!;

            if(cell_chain_0 == cell_chain_1) {
                return new SetStatus(link.node, Status.Dead, reason("refusing to close loop", cell_chain_0));
            }
        }
    }

    if(live_cells.length + unknown_cells.length == 2) {
        const link_chain_id = solver.chains.get(link.node.id)!;

        for(const cell of live_cells) {
            const cell_chain_id = solver.chains.get(cell.node.id)!;
            if(cell_chain_id < link_chain_id) {
                return new SetChain(link.node, cell_chain_id, reason("cell->link chain propagation", cell.node.id));
            } else if(link_chain_id < cell_chain_id) {
                return new SetChain(cell.node, link_chain_id, reason("link->cell chain propagation", link.node.id));
            }
        }
    }

    return null;
}

function process_cell(solver: Solver, cell: Cell) : Action | null {
    const status = solver.statuses.get(cell.node.id);
    const [live_links, unknown_links] = solver.split_links(cell.node.links);

    if(live_links.length > 0 && status == Status.Dead) {
        return new Fail("dead cell with live links: " + cell.node.id);
    }

    if(live_links.length > 2) {
        return new Fail("cell with " + live_links.length + " live links: " + cell.node.id);
    }

    if(status == Status.Live) {
        if(unknown_links.length > 0) {
            if(live_links.length == 2) {
                return new SetStatus(unknown_links[0].node, Status.Dead, reason("cell->link erasure", cell.node.id));
            }

            if(live_links.length + unknown_links.length == 2) {
                return new SetStatus(unknown_links[0].node, Status.Live, reason("cell->link completion", cell.node.id));
            }
        }
    }

    if(status == Status.Unknown) {
        if(live_links.length > 0) {
            return new SetStatus(cell.node, Status.Live, reason("link->cell ignition", live_links[0].node.id));
        }

        if(unknown_links.length < 2) {
            return new SetStatus(cell.node, Status.Dead, reason("link->cell extinguishment", cell.node.id));
        }
    }

    if(live_links.length + unknown_links.length == 2) {
        const cell_chain_id = solver.chains.get(cell.node.id)!;

        for(const link of live_links) {
            const link_chain_id = solver.chains.get(link.node.id)!;
            if(cell_chain_id < link_chain_id) {
                return new SetChain(link.node, cell_chain_id, reason("cell->link chain propagation", cell.node.id));
            } else if(link_chain_id < cell_chain_id) {
                return new SetChain(cell.node, link_chain_id, reason("link->cell chain propagation", link.node.id));
            }
        }
    }

    return null;
}

export class Solver {
    grid: Grid;
    candidates: Set<Id>;
    statuses: Map<Id, Status>;
    chains: Map<CellId, CellId>;

    constructor(grid: Grid) {
        this.grid = grid;
        this.candidates = new Set();
        this.statuses = new Map();
        this.chains = new Map();

        for(const id of grid.hints.keys()) {
            this.candidates.add(id);
            this.statuses.set(id, Status.Unknown);
        }
        for(const id of grid.cells.keys()) {
            this.candidates.add(id);
            this.statuses.set(id, Status.Unknown);
            this.chains.set(id, id);
        }
        for(const id of grid.links.keys()) {
            this.candidates.add(id);
            this.statuses.set(id, Status.Unknown);
            this.chains.set(id, id);
        }
    }

    solve() {
        while(true) {
            const action = this.process();
            if(action) {
                action.execute(this);
                output('.');
            } else {
                break;
            }
        }
    }

    next_candidate() : Id | null {
        return this.candidates.values().next().value;
    }

    process() : Action | null {
        const id = this.next_candidate();
        if(id == null) {
            return null;
        }

        let result = null;
        switch(id.charAt(0)) {
            case 'c': result = process_cell(this, this.grid.cells.get(id)!); break;
            case 'l': result = process_link(this, this.grid.links.get(id)!); break;
            case 'h': result = process_hint(this, this.grid.hints.get(id)!); break;
            default: throw 'bad id format: ' + id;
        }

        if(result != null) {
            return result;
        } else {
            return new RepealCandidacy(id);
        }
    }

    // Split cells into Live, Unknown, and Dead cells
    split_cells(cells: Array<Cell>) : [Array<Cell>, Array<Cell>] {
        const result: [Array<Cell>, Array<Cell>] = [new Array(), new Array()];

        for(const cell of cells) {
            switch(this.statuses.get(cell.node.id)!) {
                case Status.Live:    result[0].push(cell); break;
                case Status.Unknown: result[1].push(cell); break;
            }
        }

        return result;
    }

    // Split links into Live, Unknown, and Dead links
    split_links(links: Array<Link>) : [Array<Link>, Array<Link>] {
        const result: [Array<Link>, Array<Link>] = [new Array(), new Array()];

        for(const link of links) {
            switch(this.statuses.get(link.node.id)!) {
                case Status.Live:    result[0].push(link); break;
                case Status.Unknown: result[1].push(link); break;
            }
        }

        return result;
    }
}

function parse_links(cx: number, input: string) : Array<LinkContent> {
    /*
        4x4:h5d9b,3,S4,3,3,4,3,S4,2
        4x4:d5gAc,S3,3,3,4,3,S3,4,3
        4x4:5kAc,S4,3,4,3,S3,4,4,3
        4x4:aCj6bC,4,4,4,S4,4,4,4,S4

        lowercase letter, a-z: skip that many cells
        hex digit (0-9, A-F): the cell's live links are encoded like so:

        #define R 1
        #define U 2
        #define L 4
        #define D 8
     */

    let link_contents = new Array();

    let i = 0;
    for(const c of input) {
        const code = c.charCodeAt(0);

        if(code >= 97 && code <= 122) { // ascii 'a' to 'z'
            i += 1 + code - 97; // skip that many cells
        } else {
            let n = 0;

            if(code >= 48 && code <= 57) { // ascii '0' to '9'
                n = code - 48;
            } else if(code >= 65 && code <= 70) { // ascii 'A' to 'F'
                n = 10 + code - 65;
            } else {
                throw new Error('what');
            }

            const x = i % cx;
            const y = (i - x) / cx;

            if(n & 1) {
                // East
                link_contents.push({ pos: { x: x + 1, y: y + 1 }, direction: Direction.East });
            }

            if(n & 2) {
                // North
                link_contents.push({ pos: { x: x + 1, y }, direction: Direction.South });
            }

            if(n & 4) {
                // West
                link_contents.push({ pos: { x, y: y + 1 }, direction: Direction.East });
            }

            if(n & 8) {
                // South
                link_contents.push({ pos: { x: x + 1, y: y + 1 }, direction: Direction.South });
            }

            ++i;
        }
    }

    return link_contents;
}

function parse_hints(cx: number, input: string) : Array<HintContent> {
    const hints_matcher = /,(S?)(\d+)/g;
    const hint_contents = new Array();

    let i = 0;
    let hint;

    while(hint = hints_matcher.exec(input)) {
        const value = parseInt(hint[2]);
        if(i < cx) {
            hint_contents.push({ index: i + 1, direction: Direction.South, value });
        } else {
            hint_contents.push({ index: i + 1 - cx, direction: Direction.East, value });
        }
        ++i;
    }

    return hint_contents;
}

export function parse_code(input: string): Solver {
    const params_matcher = /(\d+)x(\d+):([0-9a-zA-F]+)((,S?\d+)+)/;
    const params = input.match(params_matcher)!;

    const cx = parseInt(params[1]);
    const cy = parseInt(params[2]);
    const live_links = parse_links(cx, params[3]);
    const hints = parse_hints(cx, params[4]);

    return make_solver(cx, cy, live_links, hints);
}

export function make_solver(cx: Index, cy: Index, live_links: Array<LinkContent>, hint_contents: Array<HintContent>): Solver {
    const grid = make_grid(cx, cy, live_links, hint_contents);
    const solver = new Solver(grid);

    for(const link_content of live_links) {
        const id = make_link_id(link_content.pos, link_content.direction);
        solver.statuses.set(id, Status.Live);
    }

    return solver;
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

