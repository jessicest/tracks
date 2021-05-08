
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

class View {
    grid: Grid;
    canvas: any;

    constructor(canvas: any) {
        this.canvas = canvas;
        this.grid = make_grid(4, 4, [
                { pos: { x: 1, y: 1 }, direction: Direction.South },
                { pos: { x: 0, y: 2 }, direction: Direction.East },
                { pos: { x: 1, y: 4 }, direction: Direction.East },
                { pos: { x: 2, y: 4 }, direction: Direction.South }
            ],
            [4,3,3,2],
            [4,3,3,2]
        );

        canvas.addEventListener('click', (event: any) => this.click(true, this.find_object(event)));
        canvas.addEventListener('contextmenu', (event: any) => this.click(false, this.find_object(event)));
        this.redraw();
    }

    find_object(event: any) {
        return null;
    }

    click(left: boolean, object: any) {
        return null;
    }

    redraw() {
        var context = this.canvas.getContext("2d");

        // Create gradient
        var gradient = context.createRadialGradient(75, 50, 5, 90, 60, 100);
        gradient.addColorStop(0, "red");
        gradient.addColorStop(1, "white");

        // Fill with gradient
        context.fillStyle = gradient;
        context.fillRect(10, 10, 150, 80);
    }
}
