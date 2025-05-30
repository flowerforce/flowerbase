// global.d.ts

export {};

declare global {
  const context: {
    services: {
      get: (name: string) => {
        db: (dbName: string) => {
          collection: <T = any>(name: string) => {
            find: (query?: any) => {
              skip: (n: number) => any;
              limit: (n: number) => any;
              toArray: () => Promise<T[]>;
            };
            countDocuments: (query?: any) => Promise<number>;
          };
        };
      };
    };
    user: {
      id: string;
    };
  };
}
