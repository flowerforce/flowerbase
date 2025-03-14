import rulesMatcherUtils from '../rules-matcher/utils';


describe('rule function', () => {
    it('should return valid true if the operator and value match', () => {
        const mockData = {
            user: { name: 'John', age: 25 }
        };
        const mockOptions = { prefix: 'user' };
        const mockValueBlock = { name: { $eq: 'John' } };
        const result = rulesMatcherUtils.rule(mockValueBlock, mockData, mockOptions);
        expect(result.valid).toBe(true);
        expect(result.name).toBe('user.name___$eq');
    });

    it('should return valid false if the operator and value do not match', () => {
        const mockData = {
            user: { name: 'John', age: 25 }
        };
        const mockOptions = { prefix: 'user' };
        const mockValueBlock = { name: { $eq: 'Doe' } };
        const result = rulesMatcherUtils.rule(mockValueBlock, mockData, mockOptions);

        expect(result.valid).toBe(false);
        expect(result.name).toBe('user.name___$eq');
    });

    it('should handle $ref: values correctly', () => {
        const mockData = {
            user: { name: 'John', age: 25 }
        };
        const mockOptions = { prefix: 'user' };
        const mockValueBlock = { name: { $eq: '$ref:user.refName' } };
        const result = rulesMatcherUtils.rule(mockValueBlock, mockData, mockOptions);

        expect(result.valid).toBe(false);
        expect(result.name).toBe('user.name___$eq');
    });

    it('should throw an error if the operator is missing', () => {

        const mockData = {
            user: { name: 'John', age: 25 }
        };
        const mockOptions = { prefix: 'user' };
        const missingOperatorBlock = { name: { $notFoundOperator: 'value' } };
        expect(() => {
            rulesMatcherUtils.rule(missingOperatorBlock, mockData, mockOptions);
        }).toThrow('Error missing operator:$notFoundOperator');
    });
});
