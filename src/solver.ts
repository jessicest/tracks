
import {
    Cell,
    Direction,
    Grid,
    Hint,
    Index,
    Link,
    LinkId,
    State,
    make_grid
} from './grid';

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

export class GridSolver {
    grid: Grid;

    constructor(grid: Grid) {
        this.grid = grid;
    }

    solve() {
        while(true) {
            const actions = this.process();
            if(!actions.length) {
                break;
            }

            for(const action of actions) {
                action.execute(this.grid);
            }
            console.log('.');
        }
    }

    process() : Array<Action> {
        const grid = this.grid;
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
          || loop_process(grid.dirty_hints, process_hint)
          || loop_process(grid.dirty_cells, process_cell)
          || loop_process(grid.dirty_links, process_link)
          || [];
    }
}

// Split cells into Live, Unknown, and Dead cells
export function split_cells(cells: Array<Cell>) : [Array<Cell>, Array<Cell>, Array<Cell>] {
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

// Split links into Live, Unknown, and Dead links
export function split_links(links: Array<Link>) : [Array<Link>, Array<Link>, Array<Link>] {
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

