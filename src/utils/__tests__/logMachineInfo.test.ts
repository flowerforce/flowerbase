import { logMachineInfo } from "../roles/machines/utils";

describe('logMachineInfo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should log all the info only if enabled', () => {
        const log = jest.spyOn(console, "log").mockImplementation()
        logMachineInfo({ enabled: true, machine: "A", step: 1, stepName: "test" })
        logMachineInfo({ enabled: false, machine: "A", step: 1, stepName: "test" })
        expect(log).toHaveBeenNthCalledWith(1, "MACHINE A -> STEP 1: test")
        log.mockRestore()
    });
});
