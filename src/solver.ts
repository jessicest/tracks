
// fun grids:
// 23x20:j9bCg5g56h6a5b5yAeCh5d6f6zyAj6i3a3p9f9g9gAn6i3j9b6ApAiAb63bCnAd5bAb5hCb3CzbAc6m6g5e5cA5zp3uCc,6,7,11,12,12,11,8,9,6,12,12,9,9,8,8,4,6,9,8,S7,11,15,18,18,21,13,11,11,11,8,7,7,14,10,10,13,14,10,9,12,S11,6,2
// 23x20:w3b5x5sAzxCAoAb9s3d6qCvA9i9n6zi5y3zs63zu6zm6a6p9i,17,15,11,9,10,8,8,4,5,5,1,2,2,S4,5,2,2,3,4,7,8,3,3,7,7,7,10,10,7,7,8,6,10,11,11,7,5,5,4,3,S5,6,2
// 23x20:q9t3tCAbCdCs55Cp95xCa6q5g5bCs9zo96y95x9fCAg5zh5zi6r9b5zzoCc,6,8,7,6,1,2,1,3,6,8,6,7,3,7,8,7,6,14,15,S19,12,9,3,6,6,9,11,12,10,14,S13,10,5,7,10,13,12,8,4,5,5,2,2

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
    execute(): Array<Id>;
}

function output(s: string) {
    //console.log(s);
}

function reason(label: string, id: string): string {
    return label + ': ' + id;
}

class RepealCandidacy implements Action {
    candidates: Set<Id>;
    id: Id;

    constructor(candidates: Set<Id>, id: Id) {
        this.candidates = candidates;
        this.id = id;
    }

    execute(): Array<Id> {
        output('clear: ' + this.id);
        this.candidates.delete(this.id);
        return [this.id];
    }
}

export class SetChain implements Action {
    solver: Solver;
    chains: Map<Id, Id>;
    target: Node;
    chain_id: Id;
    reason: string;

    constructor(solver: Solver, chains: Map<Id, Id>, target: Node, chain_id: Id, reason: string) {
        this.solver = solver;
        this.chains = chains;
        this.target = target;
        this.chain_id = chain_id;
        this.reason = reason;
    }

    execute(): Array<Id> {
        output('node ' + this.target.id + ' joins ' + this.chain_id + '; ' + this.reason);
        this.chains.set(this.target.id, this.chain_id);

        const [live_cells, unknown_cells] = this.solver.split_cells(this.target.cells);
        const [live_links, unknown_links] = this.solver.split_links(this.target.links);

        const modified_ids = new Array();

        for(const neighbors of [live_cells, unknown_cells, live_links, unknown_links]) {
            for(const neighbor of neighbors) {
                modified_ids.push(neighbor.node.id);
            }
        }
        modified_ids.push(this.target.id);

        for(const id of modified_ids) {
            this.solver.candidates.add(id);
        }

        return modified_ids;
    }
}

export class SetStatus implements Action {
    solver: Solver;
    node: Node;
    new_status: Status;
    reason: string;

    constructor(solver: Solver, node: Node, new_status: Status, reason: string) {
        this.solver = solver;
        this.node = node;
        this.new_status = new_status;
        this.reason = reason;
    }

    execute(): Array<Id> {
        output(this.node.id + ' -> ' + this.new_status + '; ' + this.reason);
        const modified_ids = new Array();

        this.solver.statuses.set(this.node.id, this.new_status);

        const [live_cells, unknown_cells] = this.solver.split_cells(this.node.cells);
        const [_live_links, unknown_links] = this.solver.split_links(this.node.links);

        for(const neighbors of [[this], live_cells, unknown_cells, unknown_links, this.node.hints]) {
            for(const neighbor of neighbors) {
                modified_ids.push(neighbor.node.id);
            }
        }

        for(const id of modified_ids) {
            this.solver.candidates.add(id);
        }
        if(this.new_status == Status.Dead) {
            this.solver.candidates.delete(this.node.id);
            this.solver.hemichains.delete(this.node.id);
        }

        return modified_ids;
    }
}

class Fail implements Action {
    reason: string;

    constructor(reason: string) {
        this.reason = reason;
    }

    execute(): Array<Id> {
        throw new Error("failure executed: " + this.reason);
    }
}

// for zone testing: 4x4:d4h8b,2,S2,3,3,3,S3,1,3
type ZoneId = string;

class Zone {
    id: ZoneId;
    progenitor_id: NodeId;
    index: number;
    link_count: number;
    status: Status;
    contents: Set<NodeId>;

    constructor(progenitor_id: NodeId, index: number) {
        this.progenitor_id = progenitor_id;
        this.index = index;
        this.id = progenitor_id + ":" + index;
        this.link_count = 0;
        this.status = Status.Unknown;
        this.contents = new Set();
    }
}

function try_propagate_chain(solver: Solver, chains: Map<Id, Id>, node1: Node, node2: Node, reason_string: string): Action | null {
    const chain1 = chains.get(node1.id);
    const chain2 = chains.get(node2.id);

    if(chain1 == null && chain2 == null) {
        return null;
    }

    if(chain1 != null && (chain2 == null || chain1 < chain2)) {
        return new SetChain(solver, chains, node2, chain1, reason(reason_string, node1.id));
    } else if(chain2 != null && (chain1 == null || chain2 < chain1)) {
        return new SetChain(solver, chains, node1, chain2, reason(reason_string, node2.id));
    }

    return null;
}

function process_hint(solver: Solver, hint: Hint) : Action | null {
    const [live_cells, unknown_cells] = solver.split_cells(hint.node.cells);

    if(unknown_cells.length > 0) {
        if(live_cells.length == hint.value) {
            return new SetStatus(solver, unknown_cells[0].node, Status.Dead, reason("hint->cell extinction", hint.node.id));
        }

        if(live_cells.length + unknown_cells.length == hint.value) {
            return new SetStatus(solver, unknown_cells[0].node, Status.Live, reason("hint->cell creation", hint.node.id));
        }

        if(live_cells.length == hint.value - 1) {
            const [_live_links, unknown_links] = solver.split_links(hint.node.links);
            for(const link of unknown_links) {
                const [live_neighbors, _unknown_neighbors] = solver.split_cells(link.node.cells);
                if(live_neighbors.length == 0) {
                    return new SetStatus(solver, link.node, Status.Dead, reason("hint->link restriction", hint.node.id));
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
            return new SetStatus(solver, link.node, Status.Dead, reason("cell->link extinguish", link.node.cells[0].node.id));
        }

        if(live_cells.length == 2) {
            const cell_chain_0 = solver.chains.get(live_cells[0].node.id)!;
            const cell_chain_1 = solver.chains.get(live_cells[1].node.id)!;

            if(cell_chain_0 == cell_chain_1) {
                return new SetStatus(solver, link.node, Status.Dead, reason("refusing to close loop", cell_chain_0));
            }
        }
    }

    if(status == Status.Live) {
        for(const cell of live_cells) {
            const action = try_propagate_chain(solver, solver.chains, link.node, cell.node, "link->chain propagation");
            if(action != null) {
                return action;
            }
        }
    }

    if(live_cells.length + unknown_cells.length == 2 && solver.hemichains.has(link.node.id)) {
        for(const cell of live_cells.concat(unknown_cells)) {
            const action = try_propagate_chain(solver, solver.hemichains, link.node, cell.node, "link->hemichain propagation");
            if(action != null) {
                return action;
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
                return new SetStatus(solver, unknown_links[0].node, Status.Dead, reason("cell->link erasure", cell.node.id));
            }

            if(live_links.length + unknown_links.length == 2) {
                return new SetStatus(solver, unknown_links[0].node, Status.Live, reason("cell->link completion", cell.node.id));
            }
        }
    }

    if(status == Status.Unknown) {
        if(live_links.length > 0) {
            return new SetStatus(solver, cell.node, Status.Live, reason("link->cell ignition", live_links[0].node.id));
        }

        if(unknown_links.length < 2) {
            return new SetStatus(solver, cell.node, Status.Dead, reason("link->cell extinguishment", cell.node.id));
        }
    }

    if(status == Status.Live) {
        for(const link of live_links) {
            const action = try_propagate_chain(solver, solver.chains, cell.node, link.node, "cell->chain propagation");
            if(action != null) {
                return action;
            }
        }
    }

    if(live_links.length + unknown_links.length == 2 && solver.hemichains.has(cell.node.id)) {
        for(const link of live_links.concat(unknown_links)) {
            const action = try_propagate_chain(solver, solver.hemichains, cell.node, link.node, "cell->hemichain propagation");
            if(action != null) {
                return action;
            }
        }
    }

    return null;
}

export class Solver {
    grid: Grid;
    candidates: Set<Id>;
    statuses: Map<Id, Status>;
    chains: Map<Id, Id>;
    hemichains: Map<Id, Id>;

    constructor(grid: Grid) {
        this.grid = grid;
        this.candidates = new Set();
        this.statuses = new Map();
        this.chains = new Map();
        this.hemichains = new Map();

        for(const id of grid.cells.keys()) {
            this.candidates.add(id);
            this.statuses.set(id, Status.Unknown);
            this.chains.set(id, id);
            //this.hemichains.set(id, id);
        }
        for(const id of grid.links.keys()) {
            //this.candidates.add(id); // pretty sure we actually don't need this
            this.statuses.set(id, Status.Unknown);
            this.chains.set(id, id);
        }
        for(const id of grid.hints.keys()) {
            this.candidates.add(id);
            this.statuses.set(id, Status.Unknown);
        }
    }

    solve() {
        while(true) {
            const action = this.process();
            if(action) {
                action.execute();
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
        if(id != null) {
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
                return new RepealCandidacy(this.candidates, id);
            }
        } else {
            // zone scan time.... if it were working, but it isn't
            return null; // so we abort

            const [_, root_links] = this.split_links([...this.grid.links.values()]);
            for(const root_link of root_links) {
                const [live_root_cells, unknown_root_cells] = this.split_cells(root_link.node.cells);
                const root_cells = live_root_cells.concat(unknown_root_cells);
                if(root_cells.length != 2) {
                    continue;
                }

                const a_nodes = [root_cells[0].node];
                const a = new Zone(root_link.node.id, 0);
                a.contents.add(a_nodes[0].id);

                const b_nodes = [root_cells[1].node];
                const b = new Zone(root_link.node.id, 1);
                b.contents.add(b_nodes[0].id);

                while(a.status == Status.Unknown && a_nodes.length > 0) {
                    const node = a_nodes.pop()!;
                    const [live_links, unknown_links] = this.split_links(node.links);
                    const [live_cells, unknown_cells] = this.split_cells(node.cells);

                    a.link_count += live_links.length;

                    for(const neighbor of unknown_links.map(link => link.node)
                            .concat(live_cells.map(cell => cell.node), unknown_cells.map(cell => cell.node))) {
                        if(neighbor == b_nodes[0]) {
                            a.status = Status.Dead;
                            b.status = Status.Dead;
                        }
                        if(!a.contents.has(neighbor.id)) {
                            a.contents.add(neighbor.id);
                        }
                    }
                }

                if(a.status == Status.Dead) {
                    if(a.link_count == 0) {
                        for(const content in a.contents) {
                            const node = this.grid.cells.has(content) ? this.grid.cells.get(content)!.node : this.grid.links.get(content)!.node;
                            return new SetStatus(this, node, Status.Dead, reason("empty zone", root_link.node.id));
                        }
                    }
                    continue;
                } else {
                    a.status = Status.Live;
                    b.status = Status.Live;
                }

                if(a.link_count % 2 == 0) {
                    return new SetStatus(this, root_link.node, Status.Dead, reason("maintain even zone", root_link.node.id));
                } else {
                    return new SetStatus(this, root_link.node, Status.Live, reason("create even zone", root_link.node.id));
                }
            }
        }

        return null;
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

