
// TODO gestire session di esecuzione in base all'utente
export class FunctionsQueue {
    private q: Array<() => Promise<void>> = [];
    private running = false;

    add<T>(task: () => Promise<T>, enqueue: boolean = false): Promise<T> {
        if (!enqueue) {
            return (async () => {
                return await task()
                // try {
                //     this.running = true;
                //     const res = await task();
                //     this.running = false;
                //     return res
                // }
                // catch (e) {
                //     this.running = false
                //     throw e;
                // }

            })();
        }

        return new Promise<T>((resolve, reject) => {
            this.q.push(async () => {
                try { resolve(await task()); }
                catch (e) { reject(e as unknown); }
            });
            void this.run();
        });
    }

    private async run(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            while (this.q.length) {
                const t = this.q.shift()!;
                try { await t(); } catch (e) {
                    console.log(e)
                }
            }
        } finally {
            this.running = false;
        }
    }
}