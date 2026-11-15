'use strict';

export default class RegistryManager {
    constructor(array = [], onAppend = null) {
        this.array = Array.isArray(array) ? array : [];
        this.onAppend = onAppend;
        this.dirty = false;

        this._index = new Map();
        for (let i = 0; i < this.array.length; i++) {
            if (!this._index.has(this.array[i])) {
                this._index.set(this.array[i], i);
            }
        }
    }

    ref(value) {
        if (value === null || value === undefined || value === '') {
            return -1;
        }

        const key = String(value);
        const existing = this._index.get(key);

        if (existing !== undefined) {
            return existing;
        }

        const index = this.array.push(key) - 1;
        this._index.set(key, index);
        this.dirty = true;
        this.onAppend?.(index, key, this.array);

        return index;
    }

    refAll(values) {
        return (values ?? []).map((v) => this.ref(v));
    }

    deref(index) {
        if (typeof index !== 'number' || index < 0 || index >= this.array.length) {
            return null;
        }

        return this.array[index];
    }

    derefAll(indexes) {
        return (indexes ?? []).map((i) => this.deref(i)).filter((v) => v !== null);
    }

    clean() {
        this.dirty = false;
    }
}
