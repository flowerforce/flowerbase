import { Collection, Document } from 'mongodb';
import { User } from '../../auth/dtos';
import { Filter } from '../../features/rules/interface';
import { Role } from '../../utils/roles/interface';
import { GetValidRuleParams } from './model';
export declare const getValidRule: <T extends Role | Filter>({ filters, user, record }: GetValidRuleParams<T>) => T[];
export declare const getFormattedQuery: (filters: Filter[] | undefined, query: Parameters<Collection<Document>["findOne"]>[0], user?: User) => any[];
//# sourceMappingURL=utils.d.ts.map