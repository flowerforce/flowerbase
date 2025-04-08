import { someAsync } from "../helpers/someAsync";

const mockArray = [1, 3, 4, 4, 5]

describe('someAsync function', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('should return true', async () => {
        let i = 0
        const callback = async (el: unknown, index: number): Promise<boolean> => {
            i = index
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(index < 6);
                }, 0);
            });
        }
        const response = await someAsync(mockArray, callback)
        expect(response).toEqual(true)
        expect(i).toEqual(0)
    });
    it('should return true for the last element', async () => {
        let i = 0
        const callback = async (el: unknown, index: number): Promise<boolean> => {
            i = index
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(index > 3);
                }, 0);
            });
        }
        const response = await someAsync(mockArray, callback)
        expect(response).toEqual(true)
        expect(i).toEqual(4)
    });

    it('should return false', async () => {
        let i = 0
        const callback = async (el: unknown, index: number): Promise<boolean> => {
            i = index
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(index > 4);
                }, 0);
            });
        }
        const response = await someAsync(mockArray, callback)
        expect(response).toEqual(false)
        expect(i).toEqual(4)
    });



})
