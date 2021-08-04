
import {
    Cell,
    Direction,
    Grid,
    Hint,
    Index,
    Link,
    LinkId
} from './grid';

export const enum Status {
    Live,
    Unknown,
    Dead,
}

interface Action {
    execute(solver: Solver): void;
}

function reason(label: string, id: string): string {
    return label + ': ' + id;
}

class SetCellStatus implements Action {
    cell: Cell;
    new_status: Status;
    reason: string;

    constructor(cell: Cell, new_status: Status, reason: string) {
        this.cell = cell;
        this.new_status = new_status;
        this.reason = reason;
    }

    execute(solver: Solver) {
        console.log('cell ' + this.cell.id + ' -> ' + this.new_status + '; ' + this.reason);
        solver.statuses.set(this.cell.id, this.new_status);

        const [_live_links, unknown_links, _dead_links]: [Array<Link>, Array<Link>, Array<Link>] = solver.split_links(this.cell.links);
        for(const link of unknown_links) {
            solver.candidates.add(link.id);
        }
        for(const hint of this.cell.hints) {
            solver.candidates.add(hint.id);
        }
    }
}

class SetLinkStatus implements Action {
    link: Link;
    new_status: Status;
    reason: string;

    constructor(link: Link, new_status: Status, reason: string) {
        this.link = link;
        this.new_status = new_status;
        this.reason = reason;
    }

    execute(solver: Solver) {
        console.log('link ' + this.link.id + ' -> ' + this.new_status + '; ' + this.reason);

        const [live_cells, unknown_cells, _dead_cells] = split_cells(this.link.cells);
        for(const cell of unknown_cells) {
            solver.candidates.add(this.cell.id);
        }

        solver.statuses.set(this.link.id, this.new_status);

        if(this.link.hint) {
            solver.candidates.add(this.link.hint.id);
        }

        if(this.new_status == Status.Live) {
            for(const cell of this.link.cells) {
                this.propagate_chain_id(solver, cell, solver.link_chains.get(this.link.id)!);
            }
        }
    }

    // For every connected live link, set its chain id to match
    propagate_chain_id(solver: Solver, cell: Cell, chain_id: LinkId) {
        const [live_links, _unknown_links, _dead_links] = solver.split_links(cell.links);
        for(const link of live_links) {
            const link_chain_id = solver.link_chains.get(link.id)!;
            if(link.chain_id == chain_id) {
                continue;
            }

            solver.link_chains.set(link.id, chain_id);
            solver.candidates.add(link.id);

            for(const neighbor of link.cells) {
                this.propagate_chain_id(solver, neighbor, chain_id);
            }
        }
    }
}

class Fail implements Action {
    execute(grid: Grid) {
        throw new Error("failure executed!");
    }
}

function process_hint(solver: Solver, hint: Hint) : Array<Action> {
    const [live_cells, unknown_cells, dead_cells] = solver.split_cells(hint.cells);

    if(unknown_cells.length > 0) {
        if(live_cells.length == hint.value) {
            return new SetCellStatus(unknown_cells[0], Status.Dead, reason("hint erasure", unknown_cells[0].id));
        }

        if(live_cells.length + unknown_cells.length == hint.value) {
            return new SetCellStatus(unknown_cells[0], Status.Live, reason("hint completion", unknown_cells[0].id));
        }

        if(live_cells.length + unknown_cells.length == hint.value - 1) {
            const [live_links, unknown_links, dead_links] = solver.split_links(hint.links);
            if(unknown_links.length > 0) {
                return new SetLinkStatus(unknown_links[0], Status.Dead, reason("hint restriction", hint.id));
            }
        }
    }

    return null;
}

function process_link(solver: Solver, link: Link) : Array<Action> {
    const status = solver.statuses.get(link.id);
    if(status == Status.Unknown) {
        const [live_cells, unknown_cells, dead_cells] = split_cells(link.cells);

        if(live_cells.length) {
            return new SetLinkStatus(link, Status.Live, reason("cell->link ignition", live_cells[0].id));
        }

        if(dead_cells.length) {
            return new SetLinkStatus(link, Status.Dead, reason("cell->link extinguish", live_cells[0].id));
        }

        /*
        const neighbor_links = live_cells.flatMap(cell => cell.links);
        const [live_neighbor_links, _unknown_neighbor_links, _dead_neighbor_links] = solver.split_links(neighbor_links);
        const neighbor_chain_ids = new Set(live_neighbor_links.map(link => link.chain_id));

        if(neighbor_chain_ids.size < live_neighbor_links.length) {
            return [new SetLinkStatus(link, Status.Dead, reason("closed loop", link.id))];
        }
        */
    }

    return null;
}

function process_cell(solver: Solver, cell: Cell) : Action | null {
    const status = solver.statuses.get(cell.id);
    const [live_links, unknown_links, dead_links] = solver.split_links(cell.links);

    if(live_links.length > 0 && status == Status.Dead) {
        return new Fail();
    }

    if(status == Status.Unknown) {
        if(dead_links.length > 2) {
            return new SetCellStatus(cell, Status.Dead, reason("cell extinguishment", cell.id));
        }

        if(live_links.length > 0) {
            return new SetCellStatus(cell, Status.Live, reason("cell ignition", cell.id));
        }
    }

    if(unknown_links.length > 0) {
        if(live_links.length == 2) {
            return new SetLinkStatus(unknown_links[0], Status.Dead, reason("completed cell erasure", cell.id));
        }

        if(status == Status.Live && dead_links.length == 2) {
            return new SetLinkStatus(unknown_links[0], Status.Dead, reason("completed cell erasure", cell.id));
        }
    }

    return null;
}

export class Solver {
    grid: Grid;
    candidates: Set<Id>;
    statuses: Map<Id, Status>;
    link_chains: Map<LinkId, LinkId>;

    constructor(grid: Grid) {
        this.grid = grid;
        this.statuses = new Map();

        for(const id of grid.cells.keys()) {
            statuses.set(id, Status.Curious);
        }
        for(const id of grid.links.keys()) {
            statuses.set(id, Status.Curious);
        }
        for(const id of grid.hints.keys()) {
            statuses.set(id, Status.Curious);
        }
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

    process() : Action | null {
        while(this.candidates.size) {
            for(const id of this.candidates) {
                let result = null;
                switch(id.charAt(0)) {
                    case 'c': result = process_cell(this, this.grid.cells.get(id)!); break;
                    case 'l': result = process_link(this, this.grid.links.get(id)!); break;
                    case 'h': result = process_hint(this, this.grid.hints.get(id)!); break;
                    default: throw 'bad id format: ' + id;
                }

                if(result) {
                    return result;
                } else {
                    this.candidates.delete(id);
                }
            }
        }
        return null;
    }

    // Split cells into Live, Unknown, and Dead cells
    split_cells(cells: Array<Cell>) : [Array<Cell>, Array<Cell>, Array<Cell>] {
        const result: [Array<Cell>, Array<Cell>, Array<Cell>] = [new Array(), new Array(), new Array()];

        for(const cell of cells) {
            switch(this.statuses.get(cell.id)!) {
                case Status.Live:    result[0].push(cell); break;
                case Status.Unknown: result[1].push(cell); break;
                case Status.Dead:    result[2].push(cell); break;
            }
        }

        return result;
    }

    // Split links into Live, Unknown, and Dead links
    split_links(links: Array<Link>) : [Array<Link>, Array<Link>, Array<Link>] {
        const result: [Array<Link>, Array<Link>, Array<Link>] = [new Array(), new Array(), new Array()];

        for(const link of links) {
            switch(this.statuses.get(link.id)!) {
                case Status.Live:    result[0].push(link); break;
                case Status.Unknown: result[1].push(link); break;
                case Status.Dead:    result[2].push(link); break;
            }
        }

        return result;
    }
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

