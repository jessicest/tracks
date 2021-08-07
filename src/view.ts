
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

export class View {
    grid!: Grid;
    solver!: Solver;
    canvas: any;
    cell_radius: number;
    link_radius: number;
    auto_solver: ReturnType<typeof setTimeout> | null;

    constructor(canvas: any) {
        this.canvas = canvas;
        this.cell_radius = 1;
        this.link_radius = 1;
        this.auto_solver = null;
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
                    this.execute(new SetStatus(this.solver, this.solver.grid.links.get(id)!.node, new_status, "click"));
                } else {
                    this.execute(new SetStatus(this.solver, this.solver.grid.cells.get(id)!.node, new_status, "click"));
                }
            }
        }
    }

    execute(action: Action) {
        const modified_ids = action.execute();
        const next_candidate = this.solver.next_candidate();
        if(next_candidate != null) {
            modified_ids.push(next_candidate);
        }
        this.redraw_selection(modified_ids);
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
        } else if(is_next_candidate) {
            inner_color = '#ffaa22'; // candidate
        } else if(is_candidate) {
            inner_color = '#00aa22'; // candidate
        } else if(live_cells.length == hint.value && unknown_cells.length == 0) {
            text_color = '#999999'; // satiated
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

        let px, py, cx, cy;
        if(direction == Direction.South) {
            px = x * (cell_diameter + link_diameter);
            py = y * (cell_diameter + link_diameter) + cell_diameter;
            cx = this.cell_radius;
            cy = this.link_radius;
        } else {
            px = x * (cell_diameter + link_diameter) + cell_diameter;
            py = y * (cell_diameter + link_diameter);
            cx = this.link_radius;
            cy = this.cell_radius;
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

        const qx = cx / 2;
        const qy = cy / 2;
        for(const cell of link.node.cells) {
            if(this.solver.chains.get(cell.node.id)! == this.solver.chains.get(link.node.id)!) {
                const distance = (cell.pos.y + cell.pos.x) - (link.pos.y + link.pos.x);
                switch(link.direction) {
                    case Direction.East: {
                        switch(distance) {
                            case 0: { // westward
                                this.draw_line(context, px + cx, py + qy, px, py + qy, "#880000");
                                this.draw_line(context, px + cx, py + 3 * qy, px, py + 3 * qy, "#880000");
                                break;
                            }
                            case 1: { // eastward
                                this.draw_line(context, px + cx, py + qy, px + cx * 2, py + qy, "#880000");
                                this.draw_line(context, px + cx, py + 3 * qy, px + cx * 2, py + 3 * qy, "#880000");
                                break;
                            }
                            default: throw "wait hang on a sec wait wait what wait: " + link.node.id + " vs " + cell.node.id + " makes " + [distance, direction];
                        }
                        break;
                    }
                    case Direction.South: {
                        switch(distance) {
                            case 0: { // northward
                                this.draw_line(context, px + qx, py, px + qx, py + cy, "#880000");
                                this.draw_line(context, px + 3 * qx, py, px + 3 * qx, py + cy, "#880000");
                                break;
                            }
                            case 1: { // southward
                                this.draw_line(context, px + qx, py + cy * 2, px + qx, py + cy, "#880000");
                                this.draw_line(context, px + 3 * qx, py + cy * 2, px + 3 * qx, py + cy, "#880000");
                                break;
                            }
                            default: throw "huh? but: " + link.node.id + " vs " + cell.node.id + " makes " + [distance, direction];
                        }
                        break;
                    }
                }
            }
        }
    }

    solve_step(): boolean {
        const action = this.solver.process();
        if(action) {
            this.execute(action);
            return true;
        } else {
            return false;
        }
    }

    auto_solve_step() {
        function step() {
            const solve_rate = parseInt((document.getElementById('solve_rate') as HTMLInputElement).value);
            if(window.view.solve_step()) {
                window.view.auto_solver = setTimeout(step, 1001 - solve_rate);
            } else {
                window.view.auto_solve_stop();
            }
        }

        step();
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

        if(window.view.auto_solver != null) {
            clearTimeout(window.view.auto_solver);
        }
    }

    parse() {
        const code = (document.getElementById('code') as HTMLInputElement).value;
        this.set_solver(parse_code(code));
    }
}

const canvas = document.getElementById('canvas');
window.view = new View(canvas);
