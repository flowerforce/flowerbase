import rulesMatcherUtils from "../rules-matcher/utils";

describe('isEmpty', () => {

    it('should check if a value is Empty', () => {
        expect(rulesMatcherUtils.isEmpty(undefined)).toBe(true)
        expect(rulesMatcherUtils.isEmpty(null)).toBe(true)
        expect(rulesMatcherUtils.isEmpty(() => { })).toBe(false)
        expect(rulesMatcherUtils.isEmpty("")).toBe(true)
        expect(rulesMatcherUtils.isEmpty("test")).toBe(false)
        expect(rulesMatcherUtils.isEmpty(["test"])).toBe(false)
        expect(rulesMatcherUtils.isEmpty([])).toBe(true)
        expect(rulesMatcherUtils.isEmpty({})).toBe(true)
        expect(rulesMatcherUtils.isEmpty({ some: "test" })).toBe(false)
        expect(rulesMatcherUtils.isEmpty(new Date())).toBe(false)
    });
});
