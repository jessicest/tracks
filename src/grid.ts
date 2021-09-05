
// generates a range of numbers from start (inclusive) to end (exclusive)
function* range(start: number, end?: number, step: number = 1) {
  if( end === undefined ) [start, end] = [0, start];
  for( let n = start; n < end; n += step ) yield n;
}

export const enum Direction {
    East,
    South,
}

export type Index = number;
export type Id = string;

export type Pos = {
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

export type CellId = Id;

export function make_cell_id(pos: Pos): CellId {
    return 'c' + JSON.stringify(pos);
}

export type LinkId = Id;

export function make_link_id(pos: Pos, direction: Direction): LinkId {
    return 'l' + JSON.stringify({ pos, direction });
}

export type HintId = Id;

export function make_hint_id(index: Index, direction: Direction): HintId {
    return 'h' + JSON.stringify({ index, direction });
}

export type LinkContent = {
    pos: Pos,
    direction: Direction,
};

export type HintContent = {
    index: Index,
    direction: Direction,
    value: number
};

export type NodeId = Id;

export class Node {
    id: NodeId;
    cells: Array<Cell>;
    links: Array<Link>;
    hints: Array<Hint>;

    constructor(id: NodeId) {
        this.id = id;
        this.cells = new Array();
        this.links = new Array();
        this.hints = new Array();
    }
};

export class Hint {
    node: Node;
    index: Index;
    direction: Direction;
    value: number;

    constructor(index: Index, direction: Direction, value: number) {
        this.node = new Node(make_hint_id(index, direction));
        this.index = index;
        this.direction = direction;
        this.value = value;
    }
}

export class Cell {
    node: Node;
    pos: Pos;

    constructor(pos: Pos) {
        this.node = new Node(make_cell_id(pos));
        this.pos = pos;
    }
}

export class Link {
    node: Node;
    pos: Pos;
    direction: Direction;

    constructor(pos: Pos, direction: Direction) {
        this.node = new Node(make_link_id(pos, direction));
        this.pos = pos;
        this.direction = direction;
    }
}

export class GridBuilder {
    grid: Grid;

    constructor(xmax: Index, ymax: Index) {
        this.grid = new Grid(xmax, ymax, new Map(), new Map(), new Map(), new Set());
    }

    add_cell(pos: Pos): CellId {
        const cell = new Cell(pos);
        if(this.grid.cells.has(cell.node.id)) {
            return cell.node.id;
        }

        this.grid.cells.set(cell.node.id, cell);
        this.grid.xmax = Math.max(this.grid.xmax, pos.x);
        this.grid.ymax = Math.max(this.grid.ymax, pos.y);

        this.try_connect_cell_with_link(cell.node.id, make_link_id(pos, Direction.East));
        this.try_connect_cell_with_link(cell.node.id, make_link_id(west(pos), Direction.East));
        this.try_connect_cell_with_link(cell.node.id, make_link_id(pos, Direction.South));
        this.try_connect_cell_with_link(cell.node.id, make_link_id(north(pos), Direction.South));

        this.try_connect_hint_with_cell(make_hint_id(pos.y, Direction.East), cell.node.id);
        this.try_connect_hint_with_cell(make_hint_id(pos.x, Direction.South), cell.node.id);

        return cell.node.id;
    }

    add_permalink(pos: Pos, direction: Direction): LinkId {
        const id = this.add_link(pos, direction);
        this.grid.permalinks.add(id);
        return id;
    }

    add_link(pos: Pos, direction: Direction): LinkId {
        const link = new Link(pos, direction);
        if(this.grid.links.has(link.node.id)) {
            return link.node.id;
        }

        this.grid.links.set(link.node.id, link);
        this.grid.xmax = Math.max(this.grid.xmax, pos.x);
        this.grid.ymax = Math.max(this.grid.ymax, pos.y);

        this.try_connect_cell_with_link(make_cell_id(pos), link.node.id);
        switch(direction) {
            case Direction.East:
                this.try_connect_cell_with_link(make_cell_id(east(pos)), link.node.id);
                this.try_connect_hint_with_link(make_hint_id(pos.y, Direction.East), link.node.id);
                break;
            case Direction.South:
                this.try_connect_cell_with_link(make_cell_id(south(pos)), link.node.id);
                this.try_connect_hint_with_link(make_hint_id(pos.x, Direction.South), link.node.id);
                break;
        }

        return link.node.id;
    }

    add_hint(index: Index, direction: Direction, value: number): HintId {
        const hint = new Hint(index, direction, value);
        if(this.grid.hints.has(hint.node.id)) {
            return hint.node.id;
        }

        this.grid.hints.set(hint.node.id, hint);

        switch(direction) {
            case Direction.South:
                const x = index;
                for(const y of range(this.grid.ymax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint.node.id, make_cell_id(pos));
                    this.try_connect_hint_with_link(hint.node.id, make_link_id(pos, Direction.South));
                }
                break;
            case Direction.East:
                const y = index;
                for(const x of range(this.grid.xmax + 1)) {
                    const pos = { x, y };
                    this.try_connect_hint_with_cell(hint.node.id, make_cell_id(pos));
                    this.try_connect_hint_with_link(hint.node.id, make_link_id(pos, Direction.East));
                }
                break;
        }

        return hint.node.id;
    }

    try_connect_cell_with_link(cell_id: CellId, link_id: LinkId) {
        const cell = this.grid.cells.get(cell_id);
        const link = this.grid.links.get(link_id);
        if(cell && link) {
            cell.node.links.push(link);
            link.node.cells.push(cell);
        }
    }

    try_connect_hint_with_cell(hint_id: HintId, cell_id: CellId) {
        const hint = this.grid.hints.get(hint_id);
        const cell = this.grid.cells.get(cell_id);

        if(hint && cell) {
            hint.node.cells.push(cell);
            cell.node.hints.push(hint);
        }
    }

    try_connect_hint_with_link(hint_id: HintId, link_id: LinkId) {
        const hint = this.grid.hints.get(hint_id);
        const link = this.grid.links.get(link_id);

        if(hint && link) {
            hint.node.links.push(link);
            link.node.hints.push(hint);
        }
    }

    build() : Grid {
        return this.grid;
    }
}

export class Grid {
    xmax: Index;
    ymax: Index;
    cells: Map<CellId, Cell>;
    links: Map<LinkId, Link>;
    hints: Map<HintId, Hint>;
    permalinks: Set<LinkId>;

    constructor(xmax: Index,
                ymax: Index,
                cells: Map<CellId, Cell>,
                links: Map<LinkId, Link>,
                hints: Map<HintId, Hint>,
                permalinks: Set<LinkId>) {
        this.xmax = xmax;
        this.ymax = ymax;
        this.cells = cells;
        this.links = links;
        this.hints = hints;
        this.permalinks = permalinks;
    }

    node(id: Id): Node {
        switch(id.charAt(0)) {
            case 'c': return this.cells.get(id)!.node;
            case 'l': return this.links.get(id)!.node;
            case 'h': return this.hints.get(id)!.node;
            default: throw 'unhelpful id format: ' + id;
        }
    }
}

export function make_hints(hints_north_south: Array<number>, hints_east_west: Array<number>): Array<HintContent> {
    const hint_contents = new Array();

    hints_north_south.forEach((value, index) => {
        hint_contents.push({ index: index + 1, direction: Direction.South, value });
    });

    hints_east_west.forEach((value, index) => {
        hint_contents.push({ index: index + 1, direction: Direction.East, value });
    });

    return hint_contents;
}

export function make_grid(cx: Index, cy: Index, live_links: Array<LinkContent>, hint_contents: Array<HintContent>): Grid {
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
    for(const y of range(1, zy)) {
        for(const x of range(1, zx)) {
            const pos = { x, y };
            if(x < cx) {
                builder.add_link(pos, Direction.East);
            }
            if(y < cy) {
                builder.add_link(pos, Direction.South);
            }
        }
    }

    // add live links (this will add the offramps)
    for(const link_content of live_links) {
        builder.add_permalink(link_content.pos, link_content.direction);
    }

    // add hints
    for(const hint of hint_contents) {
        builder.add_hint(hint.index, hint.direction, hint.value);
    }

    return builder.build();
}
