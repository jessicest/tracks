
import {
    Cell,
    Direction,
    Grid,
    Hint,
    Id,
    Index,
    Link,
    Pos,
    make_cell_id,
    make_grid,
    make_hints,
    make_link_id
} from './grid.js';

import {
    Action,
    SetStatus,
    Solver,
    Status,
    make_solver,
    parse_code
} from './solver.js';

declare global {
  interface Window {
    view: View;
  }
}

interface Sprite {
    paint(): void;
}

class Painter {
/*

// we can create lots of little canvases

// Create a canvas element
let canvas = document.createElement('canvas');
canvas.width = 500;
canvas.height = 400;

// Get the drawing context
let ctx = canvas.getContext('2d');

// Then you can do stuff, e.g.:
ctx.fillStyle = '#f00';
ctx.fillRect(20,10,80,50);

// and then draw them instead of recreating the gradient each time
        for(const id of grid.hints.keys()) {
            this.candidates.add(id);
            this.statuses.set(id, Status.Unknown);
        }

// so basically let's memoize each drawn sprite

*/
    
}

export class View {
    grid!: Grid;
    solver!: Solver;
    canvas: any;
    cell_radius: number;
    link_radius: number;

    constructor(canvas: any) {
        this.canvas = canvas;
        this.cell_radius = 1;
        this.link_radius = 1;
        canvas.addEventListener('click', (event: any) => {
            this.click(true, this.event_pos(event));
            event.preventDefault();
            this.redraw();
            return false;
        });
        canvas.addEventListener('contextmenu', (event: any) => {
            this.click(false, this.event_pos(event));
            event.preventDefault();
            this.redraw();
            return false;
        });

        this.set_solver(make_solver(4, 4, [
                { pos: { x: 1, y: 1 }, direction: Direction.South },
                { pos: { x: 0, y: 2 }, direction: Direction.East },
                { pos: { x: 1, y: 4 }, direction: Direction.East },
                { pos: { x: 2, y: 4 }, direction: Direction.South }
            ],
            make_hints([4,3,3,2], [4,3,3,2])
        ));

        // resize the canvas to fill browser window dynamically
        window.addEventListener('resize', window.view.resize_canvas, false);
    }

    resize_canvas() {
        this.link_radius = 400 / (3 * Math.min(this.grid.xmax, this.grid.ymax) + 9); // Fit the grid within a 400px * 400px bounding box
        this.cell_radius = this.link_radius * 2; // cell radius is double link radius
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        this.canvas.width = this.grid.xmax * (cell_diameter + link_diameter) + this.link_radius * 5 + this.cell_radius * 2;
        this.canvas.height = this.grid.ymax * (cell_diameter + link_diameter) + this.link_radius * 5 + this.cell_radius * 2;
    }

    set_solver(solver: Solver) {
        this.grid = solver.grid;
        this.solver = solver;
        this.resize_canvas();
        this.redraw();
    }

    event_pos(event: MouseEvent): Pos {
        return { x: event.offsetX, y: event.offsetY };
    }

    click(left_click: boolean, pixel_pos: Pos) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;
        const diameter = cell_diameter + link_diameter;

        const px = pixel_pos.x;
        const py = pixel_pos.y;

        const x_in_link = px % diameter > cell_diameter;
        const y_in_link = py % diameter > cell_diameter;

        const x = Math.floor(px / diameter);
        const y = Math.floor(py / diameter);

        let id = null;
        let is_link = true;
        if(!x_in_link && !y_in_link) {
            id = make_cell_id({ x, y });
            is_link = false;
        } else if(x_in_link && !y_in_link) {
            id = make_link_id({ x, y }, Direction.East);
        } else if(!x_in_link && y_in_link) {
            id = make_link_id({ x, y }, Direction.South);
        }

        if(id != null) {
            const status = this.solver.statuses.get(id);
            let new_status;
            if(left_click && status == Status.Live) {
                new_status = Status.Unknown;
            } else if(left_click && status == Status.Unknown) {
                new_status = Status.Live;
            } else if(!left_click && status == Status.Dead) {
                new_status = Status.Unknown;
            } else if(!left_click && status == Status.Unknown) {
                new_status = Status.Dead;
            }

            if(new_status != null) {
                if(is_link) {
                    this.execute(new SetStatus(this.solver, this.solver.grid.links.get(id)!.node, new_status, "click"), true);
                } else {
                    this.execute(new SetStatus(this.solver, this.solver.grid.cells.get(id)!.node, new_status, "click"), true);
                }
            }
        }
    }

    execute(action: Action, paint: boolean) {
        const modified_ids = action.execute();
        const next_candidate = this.solver.next_candidate();
        if(next_candidate != null) {
            modified_ids.push(next_candidate);
        }
        if(paint) {
            this.redraw_selection(modified_ids);
        }
    }

    get_state(id: Id): [Status, boolean, boolean] {
        const status = this.solver.statuses.get(id)!;
        const is_candidate = this.solver.candidates.has(id);
        const is_next_candidate = (id == this.solver.next_candidate());
        return [status, is_candidate, is_next_candidate];
    }

    redraw() {
        const context = this.canvas.getContext("2d");

        context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for(const hint of this.grid.hints.values()) {
            this.draw_hint(context, hint);
        }

        for(const cell of this.grid.cells.values()) {
            this.draw_cell(context, cell);
        }

        for(const link of this.grid.links.values()) {
            this.draw_link(context, link);
        }
    }

    redraw_selection(ids: Array<Id>) {
        const context = this.canvas.getContext("2d");

        for(const id of ids) {
            const hint = this.grid.hints.get(id);
            if(hint != null) {
                this.draw_hint(context, hint);
            }

            const cell = this.grid.cells.get(id);
            if(cell != null) {
                this.draw_cell(context, cell);
            }

            const link = this.grid.links.get(id);
            if(link != null) {
                this.draw_link(context, link);
            }
        }
    }

    draw_hint(context: CanvasRenderingContext2D, hint: Hint) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const px = (hint.direction == Direction.East)
            ? 0
            : hint.index * (cell_diameter + link_diameter);
        const py = (hint.direction == Direction.South)
            ? 0
            : hint.index * (cell_diameter + link_diameter);

        // states of a hint can be:
        //  - violation
        //  - sated
        //  - nigh
        //  - neutral

        const [_status, is_candidate, is_next_candidate] = this.get_state(hint.node.id);

        const num_cells = hint.node.cells.length;
        const [live_cells, unknown_cells] = this.solver.split_cells(hint.node.cells);

        let text_color = '#000000'; // neutral
        let inner_color = '#ffffff'; // neutral
        let outer_color = '#ffffff'; // neutral

        if(live_cells.length + unknown_cells.length < hint.value) {
            text_color = '#aa0000'; // violation
        } else if(live_cells.length > hint.value) {
            text_color = '#aa0000'; // violation
        } else {
            if(is_next_candidate) {
                inner_color = '#ffaa22'; // candidate
            } else if(is_candidate) {
                inner_color = '#00aa22'; // candidate
            }

            if(live_cells.length == hint.value && unknown_cells.length == 0) {
                text_color = '#999999'; // satiated
            }
        }

        this.draw_gradient(context, px, py, this.cell_radius, this.cell_radius, inner_color, outer_color);
        this.draw_text(context, px + this.cell_radius, py + this.cell_radius, hint.value.toString(), text_color);
    }

    draw_gradient(context: CanvasRenderingContext2D, px: number, py: number, cx: number, cy: number, inner_color: string, outer_color: string) {
        const gradient = context.createRadialGradient(
            px + cx,
            py + cy,
            1,
            px + cx,
            py + cy,
            Math.min(cx, cy));

        gradient.addColorStop(0, inner_color);
        gradient.addColorStop(1, outer_color);
        context.fillStyle = gradient;
        context.fillRect(px, py, cx * 2, cy * 2);
    }

    draw_text(context: CanvasRenderingContext2D, px: number, py: number, value: string, color: string) {
        context.font = '20px Tahoma';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(value, px, py);
    }

    draw_line(context: CanvasRenderingContext2D, px1: number, py1: number, px2: number, py2: number, color: string) {
        context.strokeStyle = color;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(px1, py1);
        context.lineTo(px2, py2);
        context.stroke();
    }

    draw_cell(context: CanvasRenderingContext2D, cell: Cell) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const x = cell.pos.x;
        const y = cell.pos.y;

        const px = x * (cell_diameter + link_diameter);
        const py = y * (cell_diameter + link_diameter);

        const [status, is_candidate, is_next_candidate] = this.get_state(cell.node.id);

        let inner_color, outer_color;
        if(status == Status.Dead) {
            inner_color = "#ddeeff";
        } else if(is_next_candidate) {
            inner_color = "#ffaa22";
        } else if(is_candidate) {
            inner_color = "#00aa22";
        } else {
            inner_color = "#8899dd";
        }

        if(status != Status.Live) {
            outer_color = "#ddeeff";
        } else {
            outer_color = "#8899dd";
        }

        this.draw_gradient(context, px, py, this.cell_radius, this.cell_radius, inner_color, outer_color);
    }

    draw_link(context: CanvasRenderingContext2D, link: Link) {
        const cell_diameter = this.cell_radius * 2;
        const link_diameter = this.link_radius * 2;

        const x = link.pos.x;
        const y = link.pos.y;
        const direction = link.direction;

        let px, py, cx, cy, gap;
        if(direction == Direction.South) {
            px = x * (cell_diameter + link_diameter);
            py = y * (cell_diameter + link_diameter) + cell_diameter;
            cx = this.cell_radius;
            cy = this.link_radius;
            gap = cx / 2;
        } else {
            px = x * (cell_diameter + link_diameter) + cell_diameter;
            py = y * (cell_diameter + link_diameter);
            cx = this.link_radius;
            cy = this.cell_radius;
            gap = cy / 2;
        }

        const [status, is_candidate, is_next_candidate] = this.get_state(link.node.id);

        let inner_color, outer_color;

        if(status == Status.Dead) {
            inner_color = "#ffeedd";
        } else if(is_next_candidate) {
            inner_color = "#ffaa22";
        } else if(is_candidate) {
            inner_color = "#00aa22";
        } else {
            inner_color = "#dd9988";
        }

        if(status != Status.Live) {
            outer_color = "#ffeedd";
        } else {
            outer_color = "#dd9988";
        }

        this.draw_gradient(context, px, py, cx, cy, inner_color, outer_color);

        for(const cell of link.node.cells) {
            if(this.solver.chains.get(cell.node.id)! == this.solver.chains.get(link.node.id)!) {
                const distance = (cell.pos.y + cell.pos.x) - (link.pos.y + link.pos.x);
                const cardinal = distance + (link.direction == Direction.South ? 2 : 0);
                //this.draw_chains(context, this.solver.chains, cardinal, px, py, cx, cy, gap, '#880000');
            }

            if(this.solver.hemichains.has(cell.node.id) && this.solver.hemichains.has(link.node.id)) {
                if(this.solver.hemichains.get(cell.node.id)! == this.solver.hemichains.get(link.node.id)!) {
                    const distance = (cell.pos.y + cell.pos.x) - (link.pos.y + link.pos.x);
                    const cardinal = distance + (link.direction == Direction.South ? 2 : 0);
                    this.draw_chains(context, this.solver.hemichains, cardinal,
                                     px, py, cx, cy, 3 * gap / 2, '#333333');
                }
            }
        }
    }

    // cardinal: 0 = west, 1 = east, 2 = north, 3 = south
    draw_chains(context: CanvasRenderingContext2D, chains: Map<Id, Id>, cardinal: number, px: number, py: number, cx: number, cy: number, gap: number, color: string) {
        switch(cardinal) {
            case 0: {
                this.draw_line(context, px + cx, py + cy - gap, px, py + cy - gap, color);
                this.draw_line(context, px + cx, py + cy + gap, px, py + cy + gap, color);
                break;
            }
            case 1: {
                this.draw_line(context, px + cx, py + cy - gap, px + cx + cx, py + cy - gap, color);
                this.draw_line(context, px + cx, py + cy + gap, px + cx + cx, py + cy + gap, color);
                break;
            }
            case 2: {
                this.draw_line(context, px + cx - gap, py, px + cx - gap, py + cy, color);
                this.draw_line(context, px + cx + gap, py, px + cx + gap, py + cy, color);
                break;
            }
            case 3: {
                this.draw_line(context, px + cx - gap, py + cy + cy, px + cx - gap, py + cy, color);
                this.draw_line(context, px + cx + gap, py + cy + cy, px + cx + gap, py + cy, color);
                break;
            }
            default: throw "hm.";
        }
    }

    solve_step(paint: boolean): boolean {
        const action = this.solver.process();
        if(action) {
            this.execute(action, paint);
            return true;
        } else {
            return false;
        }
    }

    auto_solve_step() {
        let next_frame_time = 0;

        function step(timestamp: DOMHighResTimeStamp) {
            if(timestamp >= next_frame_time) {
                const solve_rate = parseInt((document.getElementById('solve_rate') as HTMLInputElement).value);
                next_frame_time = timestamp + (1000 / 60);

                for(let i = 0; i < solve_rate; ++i) {
                    if(performance.now() >= next_frame_time) {
                        break;
                    }
                    if(!window.view.solve_step(true)) {
                        window.view.auto_solve_stop();
                        next_frame_time = 0;
                        return false;
                    }
                }
            }
            window.requestAnimationFrame(step);
        }

        window.requestAnimationFrame(step);
    }

    auto_solve_start() {
        const button = document.getElementById('auto') as HTMLButtonElement;
        button.innerHTML = 'stop';
        button.onclick = window.view.auto_solve_stop;

        window.view.auto_solve_step();
    }

    auto_solve_stop() {
        const button = document.getElementById('auto') as HTMLButtonElement;
        button.innerHTML = 'start';
        button.onclick = window.view.auto_solve_start;
        window.view.redraw();
    }

    parse() {
        window.view.auto_solve_stop();
        const code = (document.getElementById('code') as HTMLInputElement).value;
        this.set_solver(parse_code(code));
    }
}

const canvas = document.getElementById('canvas');
window.view = new View(canvas);
