import rulesMatcherUtils from "../rules-matcher/utils";

describe('getDefaultRule', () => {

    it('should return the default rule', () => {
        expect(rulesMatcherUtils.getDefaultRule(2)).toEqual({ op: '$eq', value: 2 })
        expect(rulesMatcherUtils.getDefaultRule("test")).toEqual({ op: '$eq', value: "test" })
        expect(rulesMatcherUtils.getDefaultRule(true)).toEqual({ op: '$exists', value: true })
        expect(rulesMatcherUtils.getDefaultRule(["test"])).toEqual({ op: '$in', value: ["test"] })
        expect(rulesMatcherUtils.getDefaultRule({ name: "John" })).toEqual({
            name: "John",
            op: "name",
            value: "John"
        })
        expect(rulesMatcherUtils.getDefaultRule({ name: "John", value: "test" })).toEqual({
            name: "John",
            op: "name",
            value: "test"
        })
        expect(rulesMatcherUtils.getDefaultRule({ name: "John", value: "test", op: "$in" })).toEqual({
            name: "John",
            op: "$in",
            value: "test"
        })
        expect(rulesMatcherUtils.getDefaultRule(undefined)).toEqual({ op: '$eq', value: undefined })
    });


});
