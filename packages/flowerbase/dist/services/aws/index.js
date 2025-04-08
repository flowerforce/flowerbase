"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lambda_1 = __importDefault(require("aws-sdk/clients/lambda"));
const s3_1 = __importDefault(require("aws-sdk/clients/s3"));
const accessKeyId = "GET_THIS_FROM_CONFIG";
const secretAccessKey = "GET_THIS_FROM_CONFIG";
const Aws = () => {
    return {
        lambda: (region) => {
            const lambda = new lambda_1.default({
                region: region,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                }
            });
            lambda.Invoke = (...args) => __awaiter(void 0, void 0, void 0, function* () {
                const res = yield lambda.invoke(...args).promise();
                return Object.assign(Object.assign({}, res), { Payload: {
                        text: () => res.Payload
                    } });
            });
            lambda.InvokeAsync = lambda.invokeAsync;
            return lambda;
        },
        s3: (region) => new s3_1.default({
            region,
            apiVersion: '2006-03-01',
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
            s3ForcePathStyle: true,
            signatureVersion: 'v4',
        })
    };
};
exports.default = Aws;
