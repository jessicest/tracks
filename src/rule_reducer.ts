
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
    candidates: Set<Id>;
    set_status: SetGridStatus;

    constructor(rule_reducer: RuleReducer, node: Node, new_status: Status, reason: string) {
        this.candidates = rule_reducer.candidates;
        this.set_status = new SetGridStatus(rule_reducer.grid_state, node, new_status, reason);
    }

    execute(): Array<Id> {
        const modified_ids = this.set_status.execute();

        for(const id of modified_ids) {
            this.candidates.add(id);
        }

        return modified_ids;
    }
}

export class SetChain implements Action {
    grid_state: GridState;
    chains: Map<Id, Id>;
    target: Node;
    chain_id: Id;
    reason: string;

    constructor(rule_reducer: RuleReducer, chains: Map<Id, Id>, target: Node, chain_id: Id, reason: string) {
        this.grid_state = rule_reducer.grid_state;
        this.chains = rule_reducer.chains;
        this.target = target;
        this.chain_id = chain_id;
        this.reason = reason;
    }

    execute(): Array<Id> {
        output('node ' + this.target.id + ' joins ' + this.chain_id + '; ' + this.reason);
        this.chains.set(this.target.id, this.chain_id);

        const [live_cells, unknown_cells] = this.grid_state.split_cells(this.target.cells);
        const [live_links, unknown_links] = this.grid_state.split_links(this.target.links);

        const modified_ids = [this.target.id];
        for(const neighbors of [live_cells, unknown_cells, live_links, unknown_links]) {
            for(const neighbor of neighbors) {
                modified_ids.push(neighbor.node.id);
            }
        }
        return modified_ids;
    }
}

export class RuleReducer {
    grid_state: GridState;
    candidates: Set<Id>;
    chains: Map<Id, Id>;
    hemichains: Map<Id, Id>;

    constructor(
        grid_state: GridState,
        candidates: Set<Id>,
        chains: Map<Id, Id>,
        hemichains: Map<Id, Id>) {
        this.grid_state = grid_state;
        this.candidates = candidates;
        this.chains = chains;
        this.hemichains = hemichains;
    }

    initialize() {
        for(const id of this.grid_state.grid.cells.keys()) {
            this.candidates.add(id);
            this.chains.set(id, id);
            //this.hemichains.set(id, id);
        }
        for(const id of this.grid_state.grid.links.keys()) {
            this.chains.set(id, id);
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

    next_candidate() : Id | null {
        return this.candidates.values().next().value;
    }

    process(): Action | null {
        const id = this.next_candidate();
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

        if(live_links.length + unknown_links.length == 2 && this.hemichains.has(cell.node.id)) {
            for(const link of live_links.concat(unknown_links)) {
                const action = this.try_propagate_chain(this.hemichains, cell.node, link.node, "cell->hemichain propagation");
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

        if(live_cells.length + unknown_cells.length == 2 && this.hemichains.has(link.node.id)) {
            for(const cell of live_cells.concat(unknown_cells)) {
                const action = this.try_propagate_chain(this.hemichains, link.node, cell.node, "link->hemichain propagation");
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
