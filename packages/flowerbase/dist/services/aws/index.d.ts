import { AWSError } from 'aws-sdk';
import Lambda from 'aws-sdk/clients/lambda';
import S3 from 'aws-sdk/clients/s3';
import { PromiseResult } from 'aws-sdk/lib/request';
declare const Aws: () => {
    lambda: (region: string) => Lambda & {
        Invoke: (...args: Parameters<Lambda["invoke"]>) => Promise<PromiseResult<Lambda.InvocationResponse, AWSError>>;
        InvokeAsync: Lambda["invokeAsync"];
    };
    s3: (region: string) => S3;
};
export default Aws;
//# sourceMappingURL=index.d.ts.map