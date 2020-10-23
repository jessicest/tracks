var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
function main() {
    console.log("Hello, world!");
}
function range(start, end, step) {
    var n;
    var _a;
    if (step === void 0) { step = 1; }
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if (end === undefined)
                    _a = [0, start], start = _a[0], end = _a[1];
                n = start;
                _b.label = 1;
            case 1:
                if (!(n <= end)) return [3 /*break*/, 4];
                return [4 /*yield*/, n];
            case 2:
                _b.sent();
                _b.label = 3;
            case 3:
                n += step;
                return [3 /*break*/, 1];
            case 4: return [2 /*return*/];
        }
    });
}
var Direction;
(function (Direction) {
    Direction[Direction["East"] = 0] = "East";
    Direction[Direction["South"] = 1] = "South";
})(Direction || (Direction = {}));
var Pos = /** @class */ (function () {
    function Pos(x, y) {
        this.x = x;
        this.y = y;
    }
    return Pos;
}());
function south() {
    return new Pos(this.x, this.y + 1);
}
function east() {
    return new Pos(this.x + 1, this.y);
}
function north() {
    return new Pos(this.x, this.y - 1);
}
function west() {
    return new Pos(this.x - 1, this.y);
}
var State;
(function (State) {
    State[State["Live"] = 0] = "Live";
    State[State["Unknown"] = 1] = "Unknown";
    State[State["Dead"] = 2] = "Dead";
})(State || (State = {}));
var Hint = /** @class */ (function () {
    function Hint(id, value) {
        this.id = id;
        this.value = value;
        this.cells = new Array();
        this.links = new Array();
    }
    return Hint;
}());
var Cell = /** @class */ (function () {
    function Cell(id) {
        this.id = id;
        this.hints = new Array();
        this.links = new Array();
        this.state = Unknown;
    }
    return Cell;
}());
var Link = /** @class */ (function () {
    function Link(id) {
        this.id = id;
        this.chain_id = id;
        this.hint_id = null;
        this.cells = new Array();
        this.state = Unknown;
    }
    return Link;
}());
var SetCellState = /** @class */ (function (_super) {
    __extends(SetCellState, _super);
    function SetCellState() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SetCellState;
}(Action));
function execute(grid) {
    var cell = grid.cells.get(this.cell_id);
    cell.state = this.new_state;
    var _a = get_links(grid.links, cell.links), _ = _a[0], unknown_links = _a[1], _ = _a[2];
    for (var link in unknown_links) {
        grid.dirty_links.add(link.id);
    }
    for (var hint_id in cell.hints) {
        grid.dirty_hints.add(hint_id);
    }
}
var SetLinkState = /** @class */ (function (_super) {
    __extends(SetLinkState, _super);
    function SetLinkState() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SetLinkState;
}(Action));
function execute(grid) {
    var link = grid.links.get(this.link_id);
    link.state = this.new_state;
    var _a = get_cells(grid.cells, link.cells), live_cells = _a[0], unknown_cells = _a[1], _ = _a[2];
    for (var cell in unknown_cells) {
        grid.dirty_cells.add(cell.id);
    }
    if (link.hint_id.is_some()) {
        grid.dirty_hints.add(link.hint_id.unwrap());
    }
    for (var cell in live_cells) {
        grid.dirty_cells.add(cell.id);
        this.propagate_chain_id(grid, cell, link.chain_id);
    }
}
// For every connected live link, set its chain id to match
function propagate_chain_id(grid, cell, chain_id) {
    var _a = get_links(grid.links, cell.links), live_links = _a[0], _ = _a[1], _ = _a[2];
    for (var link in live_links) {
        if (link.chain_id == chain_id) {
            continue;
        }
        link.chain_id = chain_id;
        grid.dirty_links.add(link.id);
        grid.dirty_cells.add(cell.id);
        for (var neighbor_id in link.cells) {
            propagate_chain_id(grid, grid.cells.get(neighbor_id), chain_id);
        }
    }
}
var Fail = /** @class */ (function (_super) {
    __extends(Fail, _super);
    function Fail() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return Fail;
}(Action));
function execute() {
    throw new Error("failure executed!");
}
function process_hint(grid, hint) {
    var _a = get_cells(grid.cells, hint.cells), live_cells = _a[0], unknown_cells = _a[1], dead_cells = _a[2];
    if (unknown_cells.length > 0) {
        if (live_cells.length == hint.value) {
            return unknown_cells.map(function (cell) { return new SetCellState(cell.id, Dead); });
        }
        if (live_cells.length + unknown_cells.length == hint.value) {
            return unknown_cells.map(function (cell) { return new SetCellState(cell.id, Live); });
        }
        if (live_cells.length + unknown_cells.length == hint.value - 1) {
            var _b = get_links(grid.links, hint.links), live_links = _b[0], unknown_links = _b[1], dead_links = _b[2];
            if (unknown_links.length > 0) {
                return unknown_links.map(function (link) { return new SetLinkState(link.id, Dead); });
            }
        }
    }
    return [];
}
function process_link(grid, link) {
    var _a = get_cells(grid.cells, link.cells), live_cells = _a[0], _ = _a[1], _ = _a[2];
    var neighbor_link_ids = live_cells.flat_map( | cell | cell.links.clone());
    var _b = get_links(grid.links, neighbor_link_ids), live_neighbor_links = _b[0], _ = _b[1], _ = _b[2];
    if (live_neighbor_links.windows(2).any( | w | w[0].chain_id == w[1].chain_id)) {
        return [SetLinkState(link.id, Dead)]; // closed loop rule
    }
    return [];
}
function process_cell(grid, cell) {
    var _a = get_links(grid.links, cell.links), live_links = _a[0], unknown_links = _a[1], dead_links = _a[2];
    if (live_links.length == 1 && cell.state == Dead) {
        return [new Fail()];
    }
    if (unknown_links.length > 0) {
        if (cell.state == Dead || live_links.length == 2) {
            return unknown_links.map(function (link) { return new SetLinkState(link.id, Dead); });
        }
        if (cell.state == Live && unknown_links.length <= 2) {
            return unknown_links.map(function (link) { return new SetLinkState(link.id, Live); });
        }
    }
    if (cell.state == Unknown) {
        if (dead_links.length >= 3) {
            return [SetCellState(cell.id, Dead)];
        }
        if (live_links.length > 0) {
            return [SetCellState(cell.id, Live)];
        }
    }
    return [];
}
var GridBuilder = /** @class */ (function () {
    function GridBuilder(xmax, ymax) {
        return {
            cells: new Map(),
            links: new Map(),
            hints: new Map(),
            xmax: xmax,
            ymax: ymax
        };
    }
    return GridBuilder;
}());
function add_cell(pos) {
    this.cells.set(pos, new Cell(pos));
    this.xmax = max(this.xmax, pos.x);
    this.ymax = max(this.ymax, pos.y);
    this.try_connect_cell_with_link(pos, (pos, East));
    this.try_connect_cell_with_link(pos, (pos.west(), East));
    this.try_connect_cell_with_link(pos, (pos, South));
    this.try_connect_cell_with_link(pos, (pos.north(), South));
    this.try_connect_hint_with_cell((pos.y, East), pos);
    this.try_connect_hint_with_cell((pos.x, South), pos);
}
function add_link(link_id) {
    this.links.set(link_id, new Link(link_id));
    var ;
    (pos, direction) = link_id;
    this.xmax = max(this.xmax, pos.x);
    this.ymax = max(this.ymax, pos.y);
    this.try_connect_cell_with_link(pos, link_id);
    switch (direction) {
        case East:
            this.try_connect_cell_with_link(pos.east(), link_id);
            this.try_connect_hint_with_link((pos.y, East), link_id);
            break;
        case South:
            this.try_connect_cell_with_link(pos.south(), link_id);
            this.try_connect_hint_with_link((pos.x, South), link_id);
            break;
    }
}
function add_hint(hint_id, value) {
    this.hints.set(hint_id, new Hint(hint_id, value));
    var ;
    (index, direction) = hint_id;
    switch (direction) {
        case East:
            var x = index;
            for (var y_1 in range(this.ymax + 1)) {
                var pos = Pos, _a = void 0, x_1 = _a.x, y_2 = _a.y;
                this.try_connect_hint_with_cell(hint_id, pos);
                this.try_connect_hint_with_link(hint_id, (pos, East));
            }
            break;
        case South:
            var y = index;
            for (var x_2 in range(this.xmax + 1)) {
                var pos = Pos, _b = void 0, x_3 = _b.x, y_3 = _b.y;
                this.try_connect_hint_with_cell(hint_id, pos);
                this.try_connect_hint_with_link(hint_id, (pos, South));
            }
            break;
    }
}
function try_connect_cell_with_link(cell_id, link_id) {
    var cell = this.cells.get(cell_id);
    var link = this.links.get(link_id);
    if (cell && link) {
        cell.links.push(link_id);
        link.cells.push(cell_id);
    }
}
function try_connect_hint_with_cell(hint_id, cell_id) {
    var hint = this.hints.get(hint_id);
    var cell = this.cells.get(cell_id);
    if (hint && cell) {
        hint.cells.push(cell_id);
        cell.hints.push(hint_id);
    }
}
function try_connect_hint_with_link(hint_id, link_id) {
    var hint = this.hints.get(hint_id);
    var link = this.links.get(link_id);
    if (hint && link) {
        hint.links.push(link_id);
        link.hint_id = hint_id;
    }
}
function build() {
    return {
        dirty_cells: new (Set.bind.apply(Set, __spreadArrays([void 0], this.cells.keys())))(),
        dirty_links: new (Set.bind.apply(Set, __spreadArrays([void 0], this.links.keys())))(),
        dirty_hints: new (Set.bind.apply(Set, __spreadArrays([void 0], this.hints.keys())))(),
        cells: this.cells,
        hints: this.hints,
        links: this.links
    };
}
var Grid = /** @class */ (function () {
    function Grid(cx, cy, live_links, hints) {
        var zx = cx + 1;
        var zy = cy + 1;
        var builder = new GridBuilder(cx, cy);
        // add cells
        for (var y in range(1, zy)) {
            for (var x in range(1, zx)) {
                var pos = Pos, _a = void 0, x_4 = _a.x, y_4 = _a.y;
                builder.add_cell(pos);
            }
        }
        // add links
        for (var y in range(zy)) {
            for (var x in range(zx)) {
                var pos = Pos, _b = void 0, x_5 = _b.x, y_5 = _b.y;
                if (y_5 > 0) {
                    builder.add_link((pos, East));
                }
                if (x_5 > 0) {
                    builder.add_link((pos, South));
                }
            }
        }
        // add hints
        hints.forEach(function (hint, index) {
            builder.add_hint([index + 1, hint[1]], hint[0]);
        });
        // set some links Live as requested
        for (var link_id in live_links) {
            builder.links.get_mut(link_id).unwrap().state = Live;
        }
        builder.build();
    }
    return Grid;
}());
function solve() {
    loop;
    {
        var actions = this.process();
        if (actions.is_empty()) {
            break;
        }
        for (var action in actions) {
            action.execute();
        }
    }
}
function process() {
    function loop_process(source, process_function) {
        for (var value in source) {
            source["delete"](value);
            var result = process_function(value);
            if (!result.is_empty()) {
                return result;
            }
        }
        return null;
    }
    return loop_process(this.dirty_cells, process_cell)
        || loop_process(this.dirty_hints, process_hint)
        || loop_process(this.dirty_links, process_link)
        || [];
}
function get_cells(cells, cell_ids) {
    var result = (new Array(), new Array(), new Array());
    for (var cell_id in cell_ids) {
        var cell = cells.get(cell_id);
        switch (cell.state) {
            case Live:
                result[0].push(cell);
                break;
            case Unknown:
                result[1].push(cell);
                break;
            case Dead:
                result[2].push(cell);
                break;
        }
    }
    return result;
}
function get_links(links, link_ids) {
    var result = (new Array(), new Array(), new Array());
    for (var link_id in link_ids) {
        var link = links.get(link_id);
        switch (link.state) {
            case Live:
                result[0].push(link);
                break;
            case Unknown:
                result[1].push(link);
                break;
            case Dead:
                result[2].push(link);
                break;
        }
    }
    return result;
}
function parse(input) {
    // sample:
    // 4x4:hCfA,4,3,4,S4,4,4,S3,4 
    // that's a 4x4 grid, with:
    //   top hints 4344
    //   side hints 4344
    //   A in 3rd row, curving west->south
    //   B in 4th col, curving south->north
    //   no other tracks present
    // 
    // (\d+)x(\d+):(live links),(top hints with S marked),(side hints with S marked)
    // live links seem to be 2 chars per link
    // sample:
    // 8x8:p6k9zg9a,3,3,3,5,5,5,S2,2,4,4,S2,2,4,5,5,2
    // that's with:
    //   top hints 33355522
    //   side hints 44224552
    //   A in 3rd row, curving west->north
    //   B in 7th col, curving south->east
    //   pos (3,4) also contains a south->east fragment
    // sample:
    // 4x4:l6bA,2,2,4,S4,2,2,4,S4
    // wow that's hard. live links are actually the same as in the first example
    // sample:
    // 4x4:CkAc,S4,3,3,4,S3,4,3,4
    throw new Error("idk how to read existing track segments");
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
