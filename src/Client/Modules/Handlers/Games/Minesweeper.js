export default class Minesweeper {
    constructor(opts) {
        if (opts === void 0) {
            opts = undefined;
        }
        this.safeCells = [];
        this.rows = (opts && opts.rows) || 9;
        this.columns = (opts && opts.columns) || 9;
        this.mines = (opts && opts.mines) || 10;
        this.emote = (opts && opts.emote) || 'boom';
        this.revealFirstCell = opts && opts.revealFirstCell !== undefined ? opts.revealFirstCell : false;
        this.zeroFirstCell = opts && opts.zeroFirstCell !== undefined ? opts.zeroFirstCell : true;
        this.spaces = opts && opts.spaces !== undefined ? opts.spaces : true;
        this.returnType = (opts && opts.returnType) || 'emoji';
        this.matrix = [];
        this.types = {
            mine: this.spoilerize(this.emote),
            numbers: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map((n) => {
                return this.spoilerize(n);
            })
        };
    }

    spoilerize(str) {
        return this.spaces ? '|| :' + str + ': ||' : '||:' + str + ':||';
    }

    generateEmptyMatrix() {
        for (let i = 0; i < this.rows; i++) {
            let arr = new Array(this.columns).fill(this.types.numbers[0]);
            this.matrix.push(arr);
        }
    }

    plantMines() {
        for (let i = 0; i < this.mines; i++) {
            let x = Math.floor(Math.random() * this.rows);
            let y = Math.floor(Math.random() * this.columns);
            if (this.matrix[x][y] === this.types.mine) {
                i--;
            } else {
                this.matrix[x][y] = this.types.mine;
            }
        }
    }

    getNumberOfMines(x, y) {
        if (this.matrix[x][y] === this.types.mine) {
            return this.types.mine;
        }
        this.safeCells.push({
            x: x,
            y: y
        });
        let counter = 0;
        let hasLeft = y > 0;
        let hasRight = y < this.columns - 1;
        let hasTop = x > 0;
        let hasBottom = x < this.rows - 1;

        counter += +(hasTop && hasLeft && this.matrix[x - 1][y - 1] === this.types.mine);

        counter += +(hasTop && this.matrix[x - 1][y] === this.types.mine);

        counter += +(hasTop && hasRight && this.matrix[x - 1][y + 1] === this.types.mine);

        counter += +(hasLeft && this.matrix[x][y - 1] === this.types.mine);

        counter += +(hasRight && this.matrix[x][y + 1] === this.types.mine);

        counter += +(hasBottom && hasLeft && this.matrix[x + 1][y - 1] === this.types.mine);

        counter += +(hasBottom && this.matrix[x + 1][y] === this.types.mine);

        counter += +(hasBottom && hasRight && this.matrix[x + 1][y + 1] === this.types.mine);
        return this.types.numbers[counter];
    }

    getTextRepresentation() {
        return this.matrix
            .map((r) => {
                return r.join(this.spaces ? ' ' : '');
            })
            .join('\n');
    }

    populate() {
        this.matrix = this.matrix.map((row, x) => {
            return row.map((col, y) => {
                return this.getNumberOfMines(x, y);
            });
        });
    }

    revealFirst() {
        if (!this.revealFirstCell) {
            return {
                x: -1,
                y: -1
            };
        }
        let zeroCells = this.safeCells.filter((c) => {
            return this.matrix[c.x][c.y] === this.types.numbers[0];
        });
        if (this.zeroFirstCell && zeroCells.length > 0) {
            let safeCell = zeroCells[Math.floor(Math.random() * zeroCells.length)];
            let x = safeCell.x;
            let y = safeCell.y;
            let cell = this.matrix[x][y];
            this.matrix[x][y] = cell.slice(2, -2);
            this.revealSurroundings(safeCell);
            return {
                x: x,
                y: y
            };
        } else {
            let safeCell = this.safeCells[Math.floor(Math.random() * this.safeCells.length)];
            let x = safeCell.x;
            let y = safeCell.y;
            let cell = this.matrix[x][y];
            this.matrix[x][y] = cell.slice(2, -2);
            return {
                x: x,
                y: y
            };
        }
    }

    revealSurroundings(c, recurse) {
        if (recurse === void 0) {
            recurse = true;
        }
        let isSpoiler = (x, y) => {
            return this.matrix[x][y].includes('||');
        };
        let x = c.x;
        let y = c.y;
        let xLower = Math.max(0, x - 1);
        let yLower = Math.max(0, y - 1);
        let xUpper = Math.min(this.rows - 1, x + 1);
        let yUpper = Math.min(this.columns - 1, y + 1);
        let zeroCells = [];
        for (let i = xLower; i <= xUpper; i++) {
            for (let j = yLower; j <= yUpper; j++) {
                if (isSpoiler(i, j)) {
                    if (this.matrix[i][j] === this.types.numbers[0]) {
                        zeroCells.push({
                            x: i,
                            y: j
                        });
                    }
                    this.matrix[i][j] = this.matrix[i][j].slice(2, -2);
                }
            }
        }
        if (recurse) {
            zeroCells.forEach((c) => {
                return this.revealSurroundings(c, true);
            });
        }
    }

    start() {
        if (this.rows * this.columns <= this.mines * 2) {
            return null;
        }
        this.generateEmptyMatrix();
        this.plantMines();
        this.populate();
        this.revealFirst();
        switch (this.returnType) {
            case 'emoji':
                return this.getTextRepresentation();
            case 'code':
                return '```' + this.getTextRepresentation() + '```';
            case 'matrix':
                return this.matrix;
        }
    }
}
