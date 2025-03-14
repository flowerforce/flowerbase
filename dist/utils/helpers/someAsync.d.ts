/**
 * Asynchronously checks if at least one element in the array satisfies the given asynchronous callback function.
 *
 * @template T - The type of elements in the array.
 * @param {T[]} array - The array to iterate over.
 * @param {(element: T, index: number, arr: T[]) => Promise<boolean>} callback - An asynchronous function that takes an element, its index, and the original array,
 * and returns a Promise resolving to `true` if the condition is met, otherwise `false`.
 * @returns {Promise<boolean>} A promise that resolves to `true` if at least one element satisfies the callback condition, otherwise `false`.
 * @tested
 */
export declare function someAsync<T>(array: T[], callback: (element: T, index: number, arr: T[]) => Promise<boolean>): Promise<boolean>;
//# sourceMappingURL=someAsync.d.ts.map