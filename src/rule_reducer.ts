
import {
    Cell,
    Hint,
    Id,
    Link,
    Node
} from './grid.js';

import {
    Action,
    Fail,
    SetStatus as SetGridStatus,
    GridState,
    Status,
    Zone,
    output,
    reason
} from './grid_state.js';

function shuffle_array<T>(array: Array<T>) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export class RepealCandidacy implements Action {
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

export class SetStatus implements Action {
    rule_reducer: RuleReducer;
    set_status: SetGridStatus;

    constructor(rule_reducer: RuleReducer, node: Node, new_status: Status, reason: string) {
        this.rule_reducer = rule_reducer;
        this.set_status = new SetGridStatus(rule_reducer.grid_state, node, new_status, reason);
    }

    execute(): Array<Id> {
        const modified_ids = this.set_status.execute();

        for(const id of modified_ids) {
            this.rule_reducer.candidates.add(id);
            this.rule_reducer.guessables.add(id);
        }

        return modified_ids;
    }
}

export class SetChain implements Action {
    rule_reducer: RuleReducer;
    chains: Map<Id, Id>;
    target: Node;
    chain_id: Id;
    reason: string;

    constructor(rule_reducer: RuleReducer, chains: Map<Id, Id>, target: Node, chain_id: Id, reason: string) {
        this.rule_reducer = rule_reducer;
        this.chains = chains;
        this.target = target;
        this.chain_id = chain_id;
        this.reason = reason;
    }

    execute(): Array<Id> {
        output('node ' + this.target.id + ' joins ' + this.chain_id + '; ' + this.reason);
        this.chains.set(this.target.id, this.chain_id);

        const modified_ids = new Array();
        const neighbors: Array<[number, Node]> = [[0, this.target]];

        while(neighbors.length > 0) {
            const [distance, neighbor] = neighbors.pop()!;
            modified_ids.push(neighbor.id);

            if(distance <= 0) {
                const [live_cells, unknown_cells] = this.rule_reducer.grid_state.split_cells(this.target.cells);
                const [live_links, unknown_links] = this.rule_reducer.grid_state.split_links(this.target.links);
                for(const new_neighbors of [live_cells, unknown_cells, live_links, unknown_links]) {
                    for(const neighbor of new_neighbors) {
                        neighbors.push([distance + 1, neighbor.node]);
                    }
                }
            }

            if(distance <= 1) {
                this.rule_reducer.candidates.add(neighbor.id);
            }

            if(distance <= 2 && this.rule_reducer.grid_state.statuses.get(neighbor.id) == Status.Unknown) {
                //this.rule_reducer.guessables.add(neighbor.id);
            }
        }

        return modified_ids;
    }
}

export class RuleReducer {
    grid_state: GridState;
    candidates: Set<Id>;
    guessables: Set<Id>;
    test_subjects: Set<Id>;
    chains: Map<Id, Id>;
    allow_experimentation: boolean;

    constructor(
        grid_state: GridState,
        candidates: Set<Id>,
        guessables: Set<Id>,
        chains: Map<Id, Id>,
        allow_experimentation: boolean) {
        this.grid_state = grid_state;
        this.candidates = candidates;
        this.guessables = guessables;
        this.test_subjects = new Set();
        this.chains = chains;
        this.allow_experimentation = allow_experimentation;
    }

    clone() {
        return new RuleReducer(
            this.grid_state.clone(),
            new Set(this.candidates),
            new Set(this.guessables),
            new Map(this.chains),
            this.allow_experimentation
        );
    }

    initialize() {
        for(const id of this.grid_state.grid.cells.keys()) {
            this.candidates.add(id);
            this.guessables.add(id);
            this.chains.set(id, id);
        }
        for(const id of this.grid_state.grid.links.keys()) {
            this.chains.set(id, id);
            this.guessables.add(id);
        }
        for(const id of this.grid_state.grid.hints.keys()) {
            this.candidates.add(id);
        }
    }

    reduce() {
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

    next_candidate(candidates: Set<Id> = this.candidates) : Id | null {
        return candidates.values().next().value;
        //const c = [...this.candidates.values()];
        //return c[Math.floor(Math.random() * c.length)];
    }

    process(): Action | null {
        const action = this.process_rules();
        if(action != null) {
            return action;
        }

        if(this.allow_experimentation) {
            const action = this.process_experimentation();
            if(action != null) {
                return action;
            }
        }

        return null;
    }

    process_rules(): Action | null {
        const id = this.next_candidate(this.candidates);

        if(id != null) {
            let result = null;
            switch(id.charAt(0)) {
                case 'c': result = this.process_cell(this.grid_state.grid.cells.get(id)!); break;
                case 'l': result = this.process_link(this.grid_state.grid.links.get(id)!); break;
                case 'h': result = this.process_hint(this.grid_state.grid.hints.get(id)!); break;
                default: throw 'bad id format: ' + id;
            }

            if(result != null) {
                return result;
            } else {
                return new RepealCandidacy(this.candidates, id);
            }
        } else {
            return null;
        }
    }

    process_experimentation(): Action | null {
        const id = this.next_candidate(this.guessables);
        if(id == null) {
            return null;
        }

        if(this.grid_state.statuses.get(id) != Status.Unknown) {
            return new RepealCandidacy(this.guessables, id);
        }

        const results = new Array();
        for(const status of [Status.Live, Status.Dead]) {
            const guess = this.clone();
            guess.allow_experimentation = false;
            const action = new SetStatus(guess, this.grid_state.grid.node(id), status, reason("idk i just guessed", id));
            action.execute();

            while(true) {
                const action = guess.process();
                if(action == null) {
                    results.push([true, status]);
                    break;
                } else if(action.constructor === Fail) {
                    results.push([false, status]);
                    break;
                } else {
                    action.execute();
                }
            }
        }

        if(results[0][0] && !results[1][0]) {
            return new SetStatus(this, this.grid_state.grid.node(id), results[0][1], reason("because my guess shone true", id));
        } else if(!results[0][0] && results[1][0]) {
            return new SetStatus(this, this.grid_state.grid.node(id), results[1][1], reason("because my guess shone true", id));
        }

        return new RepealCandidacy(this.guessables, id);
    }

    process_zones(): Action | null {
        // zone scan time.... if it were working, but it isn't
        return null; // so we abort

        const [_, root_links] = this.grid_state.split_links([...this.grid_state.grid.links.values()]);
        for(const root_link of root_links) {
            const [live_root_cells, unknown_root_cells] = this.grid_state.split_cells(root_link.node.cells);
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
                const [live_links, unknown_links] = this.grid_state.split_links(node.links);
                const [live_cells, unknown_cells] = this.grid_state.split_cells(node.cells);

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
                        const node = this.grid_state.grid.cells.has(content) ? this.grid_state.grid.cells.get(content)!.node : this.grid_state.grid.links.get(content)!.node;
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

        return null;
    }

    try_propagate_chain(chains: Map<Id, Id>, node1: Node, node2: Node, reason_string: string): Action | null {
        const chain1 = chains.get(node1.id);
        const chain2 = chains.get(node2.id);

        if(chain1 == null && chain2 == null) {
            return null;
        }

        if(chain1 != null && (chain2 == null || chain1 < chain2)) {
            return new SetChain(this, chains, node2, chain1, reason(reason_string, node1.id));
        } else if(chain2 != null && (chain1 == null || chain2 < chain1)) {
            return new SetChain(this, chains, node1, chain2, reason(reason_string, node2.id));
        }

        return null;
    }

    process_cell(cell: Cell): Action | null {
        const status = this.grid_state.statuses.get(cell.node.id);
        const [live_links, unknown_links] = this.grid_state.split_links(cell.node.links);

        if(live_links.length > 0 && status == Status.Dead) {
            return new Fail("dead cell with live links: " + cell.node.id);
        }

        if(live_links.length > 2) {
            return new Fail("cell with " + live_links.length + " live links: " + cell.node.id);
        }

        if(status == Status.Live) {
            if(unknown_links.length > 0) {
                if(live_links.length == 2) {
                    return new SetStatus(this, unknown_links[0].node, Status.Dead, reason("cell->link erasure", cell.node.id));
                }

                if(live_links.length + unknown_links.length == 2) {
                    return new SetStatus(this, unknown_links[0].node, Status.Live, reason("cell->link completion", cell.node.id));
                }
            }
        }

        if(status == Status.Unknown) {
            if(live_links.length > 0) {
                return new SetStatus(this, cell.node, Status.Live, reason("link->cell ignition", live_links[0].node.id));
            }

            if(unknown_links.length < 2) {
                return new SetStatus(this, cell.node, Status.Dead, reason("link->cell extinguishment", cell.node.id));
            }
        }

        if(status == Status.Live) {
            for(const link of live_links) {
                const action = this.try_propagate_chain(this.chains, cell.node, link.node, "cell->chain propagation");
                if(action != null) {
                    return action;
                }
            }
        }

        return null;
    }

    process_link(link: Link): Action | null {
        const status = this.grid_state.statuses.get(link.node.id);
        const [live_cells, unknown_cells] = this.grid_state.split_cells(link.node.cells);

        if(status == Status.Unknown) {
            if(live_cells.length + unknown_cells.length < 2) {
                return new SetStatus(this, link.node, Status.Dead, reason("cell->link extinguish", link.node.cells[0].node.id));
            }

            if(live_cells.length == 2) {
                const cell_chain_0 = this.chains.get(live_cells[0].node.id)!;
                const cell_chain_1 = this.chains.get(live_cells[1].node.id)!;

                if(cell_chain_0 == cell_chain_1) {
                    return new SetStatus(this, link.node, Status.Dead, reason("refusing to close loop", cell_chain_0));
                }
            }
        }

        if(status == Status.Live) {
            for(const cell of live_cells) {
                const action = this.try_propagate_chain(this.chains, link.node, cell.node, "link->chain propagation");
                if(action != null) {
                    return action;
                }
            }
        }

        return null;
    }

    process_hint(hint: Hint): Action | null {
        const [live_cells, unknown_cells] = this.grid_state.split_cells(hint.node.cells);

        if(unknown_cells.length > 0) {
            if(live_cells.length == hint.value) {
                return new SetStatus(this, unknown_cells[0].node, Status.Dead, reason("hint->cell extinction", hint.node.id));
            }

            if(live_cells.length + unknown_cells.length == hint.value) {
                return new SetStatus(this, unknown_cells[0].node, Status.Live, reason("hint->cell creation", hint.node.id));
            }

            if(live_cells.length == hint.value - 1) {
                const [_live_links, unknown_links] = this.grid_state.split_links(hint.node.links);
                for(const link of unknown_links) {
                    const [live_neighbors, _unknown_neighbors] = this.grid_state.split_cells(link.node.cells);
                    if(live_neighbors.length == 0) {
                        return new SetStatus(this, link.node, Status.Dead, reason("hint->link restriction", hint.node.id));
                    }
                }
            }
        }

        return null;
    }
}
