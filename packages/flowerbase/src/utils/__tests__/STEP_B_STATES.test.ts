import { MachineContext } from "../roles/machines/interface";
import { STEP_B_STATES } from "../roles/machines/read/B";
import { evaluateDocumentFiltersReadFn, evaluateDocumentFiltersWriteFn } from "../roles/machines/read/B/validators"
import * as Utils from "../roles/machines/utils";
const { checkDocumentsFilters, evaluateDocumentsFiltersRead, evaluateDocumentsFiltersWrite } = STEP_B_STATES

jest.mock('../roles/machines/B/validators', () => ({
    evaluateDocumentFiltersReadFn: jest.fn(),
    evaluateDocumentFiltersWriteFn: jest.fn(),
}));


const endValidation = jest.fn()
const goToNextValidationStage = jest.fn()
const next = jest.fn()

describe('STEP_B_STATES', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('checkDocumentsFilters should go to next stage if document_filters is not defined', async () => {
        const mockedLogInfo = jest.spyOn(Utils, 'logMachineInfo').mockImplementation(() => 'Mocked Value');
        const mockContext = {
            params: {
                type: "search"
            },
            role: {
                name: "test"
            }
        } as MachineContext
        await checkDocumentsFilters({ endValidation, context: mockContext, goToNextValidationStage, next, initialStep: null })
        expect(goToNextValidationStage).toHaveBeenCalled()
        expect(mockedLogInfo).toHaveBeenCalledWith({ enabled: mockContext.enableLog, machine: "B", step: 1, stepName: "checkDocumentsFilters" })
        mockedLogInfo.mockRestore()
    });
    it('checkDocumentsFilters should go to evaluateDocumentsFiltersRead step if document_filters is defined', async () => {
        const mockContext = {
            params: {
                type: "search"
            },
            role: {
                name: "test",
                document_filters: {}
            }
        } as MachineContext
        await checkDocumentsFilters({ endValidation, context: mockContext, goToNextValidationStage, next, initialStep: null })
        expect(next).toHaveBeenCalledWith("evaluateDocumentsFiltersRead")
    });
    it('evaluateDocumentsFiltersRead should go to next stage if document_filters read is valid', async () => {
        const mockedLogInfo = jest.spyOn(Utils, 'logMachineInfo').mockImplementation(() => 'Mocked Value');
        const mockContext = {
            params: {
                type: "search"
            },
            role: {
                name: "test",
                document_filters: {
                    read: true
                }
            }
        } as MachineContext
        (evaluateDocumentFiltersReadFn as jest.Mock).mockReturnValue(true);
        await evaluateDocumentsFiltersRead({ endValidation, context: mockContext, goToNextValidationStage, next, initialStep: null })
        expect(goToNextValidationStage).toHaveBeenCalled()
        expect(mockedLogInfo).toHaveBeenCalledWith({ enabled: mockContext.enableLog, machine: "B", step: 2, stepName: "evaluateDocumentsFiltersRead" })
        mockedLogInfo.mockRestore()
    });
    it('evaluateDocumentsFiltersRead should go to evaluateDocumentsFiltersWrite if document_filters read is not defined or not valid', async () => {
        const mockContext = {
            params: {
                type: "search"
            },
            role: {
                name: "test",
            }
        } as MachineContext
        (evaluateDocumentFiltersReadFn as jest.Mock).mockReturnValue(false);
        await evaluateDocumentsFiltersRead({ endValidation, context: mockContext, goToNextValidationStage, next, initialStep: null })
        expect(next).toHaveBeenCalledWith("evaluateDocumentsFiltersWrite")
    });
    it('evaluateDocumentFiltersWriteFn should go to next stage if document_filters write is valid', async () => {
        const mockedLogInfo = jest.spyOn(Utils, 'logMachineInfo').mockImplementation(() => 'Mocked Value');
        const mockContext = {
            params: {
                type: "search"
            },
            role: {
                name: "test",
                document_filters: {
                    write: true
                }
            }
        } as MachineContext
        (evaluateDocumentFiltersWriteFn as jest.Mock).mockReturnValue(true);
        await evaluateDocumentsFiltersWrite({ endValidation, context: mockContext, goToNextValidationStage, next, initialStep: null })
        expect(goToNextValidationStage).toHaveBeenCalled()
        expect(mockedLogInfo).toHaveBeenCalledWith({ enabled: mockContext.enableLog, machine: "B", step: 3, stepName: "evaluateDocumentsFiltersWrite" })
        mockedLogInfo.mockRestore()
    });
    it('evaluateDocumentFiltersWriteFn should end a failed validation if document_filters write is not defined or not valid', async () => {
        const mockContext = {
            params: {
                type: "search"
            },
            role: {
                name: "test",
            }
        } as MachineContext
        (evaluateDocumentFiltersWriteFn as jest.Mock).mockReturnValue(false);
        await evaluateDocumentsFiltersWrite({ endValidation, context: mockContext, goToNextValidationStage, next, initialStep: null })
        expect(endValidation).toHaveBeenCalledWith({ success: false })
    });
});
