"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const node_path_1 = tslib_1.__importDefault(require("node:path"));
const mongodb_1 = require("mongodb");
const src_1 = require("../../packages/flowerbase/src");
const services_1 = require("../../packages/flowerbase/src/services");
const state_1 = require("../../packages/flowerbase/src/state");
const APP_ROOT = node_path_1.default.join(__dirname, 'app');
const DB_NAME = 'flowerbase-e2e';
const TODO_COLLECTION = 'todos';
const USER_COLLECTION = 'users';
const ACTIVITIES_COLLECTION = 'activities';
const COUNTERS_COLLECTION = 'counters';
const AUTH_USERS_COLLECTION = 'auth_users';
const ownerUser = {
    id: 'user-one',
    email: 'owner@example.com',
    role: 'owner',
    custom_data: {
        workspaces: ['workspace-1'],
        adminIn: ['workspace-1']
    }
};
const guestUser = {
    id: 'user-two',
    email: 'guest@example.com',
    role: 'guest',
    custom_data: {
        workspaces: ['workspace-2'],
        adminIn: []
    }
};
const adminUser = {
    id: 'user-admin',
    email: 'admin@example.com',
    role: 'admin',
    custom_data: {
        workspaces: ['workspace-1', 'workspace-2'],
        adminIn: ['workspace-1', 'workspace-2']
    }
};
const todoIds = {
    ownerFirst: new mongodb_1.ObjectId('000000000000000000000001'),
    ownerSecond: new mongodb_1.ObjectId('000000000000000000000002'),
    otherUser: new mongodb_1.ObjectId('000000000000000000000003')
};
const userIds = {
    owner: new mongodb_1.ObjectId('000000000000000000000010'),
    guest: new mongodb_1.ObjectId('000000000000000000000011')
};
const projectIds = {
    ownerProject: new mongodb_1.ObjectId('000000000000000000000020'),
    guestProject: new mongodb_1.ObjectId('000000000000000000000021')
};
const logIds = {
    activeOwner: new mongodb_1.ObjectId('000000000000000000000030'),
    inactiveOwner: new mongodb_1.ObjectId('000000000000000000000031'),
    activeGuest: new mongodb_1.ObjectId('000000000000000000000032')
};
const activityIds = {
    ownerPrivate: new mongodb_1.ObjectId('000000000000000000000101'),
    ownerPublic: new mongodb_1.ObjectId('000000000000000000000102'),
    guestPublic: new mongodb_1.ObjectId('000000000000000000000103')
};
const counterIds = {
    ownerOnly: new mongodb_1.ObjectId('000000000000000000000201'),
    workspaceAll: new mongodb_1.ObjectId('000000000000000000000202'),
    visibilityUsers: new mongodb_1.ObjectId('000000000000000000000203'),
    adminOnly: new mongodb_1.ObjectId('000000000000000000000204')
};
const authUserIds = {
    owner: new mongodb_1.ObjectId('000000000000000000000090')
};
const TRIGGER_EVENTS_COLLECTION = 'triggerEvents';
let client;
let appInstance;
let stateRules;
let originalMainPath;
const createServiceFor = (user) => services_1.services['mongodb-atlas'](appInstance, {
    rules: stateRules,
    user
});
const getTodosCollection = (user) => createServiceFor(user).db(DB_NAME).collection(TODO_COLLECTION);
const getUsersCollection = (user) => createServiceFor(user).db(DB_NAME).collection(USER_COLLECTION);
const getAuthUsersCollection = (user) => createServiceFor(user).db(DB_NAME).collection(AUTH_USERS_COLLECTION);
const getProjectsCollection = (user) => createServiceFor(user).db(DB_NAME).collection('projects');
const getActivityLogsCollection = (user) => createServiceFor(user).db(DB_NAME).collection('activityLogs');
const getActivitiesCollection = (user) => createServiceFor(user).db(DB_NAME).collection(ACTIVITIES_COLLECTION);
const getCountersCollection = (user) => createServiceFor(user).db(DB_NAME).collection(COUNTERS_COLLECTION);
const resetCollections = async () => {
    const db = client.db(DB_NAME);
    await Promise.all([
        db.collection(TODO_COLLECTION).deleteMany({}),
        db.collection(USER_COLLECTION).deleteMany({}),
        db.collection('projects').deleteMany({}),
        db.collection('activityLogs').deleteMany({}),
        db.collection(ACTIVITIES_COLLECTION).deleteMany({}),
        db.collection(COUNTERS_COLLECTION).deleteMany({}),
        db.collection(AUTH_USERS_COLLECTION).deleteMany({}),
        db.collection(TRIGGER_EVENTS_COLLECTION).deleteMany({})
    ]);
    await db.collection(TODO_COLLECTION).insertMany([
        { _id: todoIds.ownerFirst, title: 'Owner task 1', userId: ownerUser.id, sensitive: 'redacted' },
        { _id: todoIds.ownerSecond, title: 'Owner task 2', userId: ownerUser.id, sensitive: 'redacted' },
        { _id: todoIds.otherUser, title: 'Other user task', userId: guestUser.id, sensitive: 'redacted' }
    ]);
    await db.collection(USER_COLLECTION).insertMany([
        {
            _id: userIds.owner,
            userId: ownerUser.id,
            email: 'owner@example.com',
            password: 'top-secret',
            workspaces: ['workspace-1'],
            avatar: 'owner.png',
            name: 'Owner name',
            tags: ['owner'],
            updatedAt: new Date()
        },
        {
            _id: userIds.guest,
            userId: guestUser.id,
            email: 'guest@example.com',
            password: 'safe-secret',
            workspaces: ['workspace-2'],
            avatar: 'guest.png',
            name: 'Guest name',
            tags: ['guest'],
            updatedAt: new Date()
        }
    ]);
    await db.collection('projects').insertMany([
        {
            _id: projectIds.ownerProject,
            ownerId: ownerUser.id,
            name: 'Owner project',
            summary: 'Owner summary',
            secretNotes: 'top secret',
            internalCode: 'XYZ123'
        },
        {
            _id: projectIds.guestProject,
            ownerId: guestUser.id,
            name: 'Guest project',
            summary: 'Guest summary',
            secretNotes: 'guest secret',
            internalCode: 'ABC987'
        }
    ]);
    await db.collection('activityLogs').insertMany([
        {
            _id: logIds.activeOwner,
            message: 'Owner active log',
            status: 'active',
            ownerId: ownerUser.id
        },
        {
            _id: logIds.inactiveOwner,
            message: 'Owner inactive log',
            status: 'inactive',
            ownerId: ownerUser.id
        },
        {
            _id: logIds.activeGuest,
            message: 'Guest active log',
            status: 'active',
            ownerId: guestUser.id
        }
    ]);
    await db.collection(ACTIVITIES_COLLECTION).insertMany([
        {
            _id: activityIds.ownerPrivate,
            title: 'Private owner activity',
            ownerId: ownerUser.id,
            workspace: 'workspace-1',
            visibility: {
                type: 'onlyme'
            }
        },
        {
            _id: activityIds.ownerPublic,
            title: 'Shared activity',
            ownerId: 'user-three',
            workspace: 'workspace-1',
            visibility: {
                type: 'team'
            }
        },
        {
            _id: activityIds.guestPublic,
            title: 'Guest workspace activity',
            ownerId: guestUser.id,
            workspace: 'workspace-2',
            visibility: {
                type: 'group'
            }
        }
    ]);
    await db.collection(COUNTERS_COLLECTION).insertMany([
        {
            _id: counterIds.ownerOnly,
            ownerId: ownerUser.id,
            workspace: 'workspace-1',
            value: 100,
            visibility: {
                type: 'onlyme'
            }
        },
        {
            _id: counterIds.workspaceAll,
            ownerId: 'user-three',
            workspace: 'workspace-1',
            value: 200,
            visibility: {
                type: 'all'
            }
        },
        {
            _id: counterIds.visibilityUsers,
            ownerId: 'user-four',
            workspace: 'workspace-2',
            value: 300,
            visibility: {
                type: 'private',
                users: [guestUser.id]
            }
        },
        {
            _id: counterIds.adminOnly,
            ownerId: 'user-five',
            workspace: 'workspace-1',
            value: 400,
            visibility: {
                type: 'private'
            }
        }
    ]);
    await db.collection(AUTH_USERS_COLLECTION).insertMany([
        {
            _id: authUserIds.owner,
            userId: ownerUser.id,
            email: 'auth-owner@example.com',
            password: 'top-secret'
        }
    ]);
};
const waitForTriggerEvent = async (documentId) => {
    const collection = client.db(DB_NAME).collection(TRIGGER_EVENTS_COLLECTION);
    for (let attempt = 0; attempt < 10; attempt++) {
        const record = await collection.findOne({ documentId });
        if (record) {
            return record;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
};
describe('MongoDB Atlas rule enforcement (e2e)', () => {
    beforeAll(async () => {
        const mongoUrl = process.env.DB_CONNECTION_STRING ?? 'mongodb://localhost:27017';
        client = new mongodb_1.MongoClient(mongoUrl);
        await client.connect();
        originalMainPath = require.main?.path;
        if (require.main) {
            require.main.path = APP_ROOT;
        }
        await (0, src_1.initialize)({
            projectId: 'flowerbase-e2e',
            mongodbUrl: mongoUrl,
            jwtSecret: 'e2e-secret',
            port: 0,
            host: '127.0.0.1',
            basePath: APP_ROOT
        });
        appInstance = state_1.StateManager.select('app');
        stateRules = state_1.StateManager.select('rules');
        await new Promise((resolve) => setTimeout(resolve, 300));
    });
    beforeEach(async () => {
        await resetCollections();
    });
    afterAll(async () => {
        await appInstance?.close();
        await client.close();
        if (require.main) {
            require.main.path = originalMainPath;
        }
    });
    it('exports only the requesting user todos when reading', async () => {
        const todos = (await getTodosCollection(ownerUser).find({}).toArray());
        expect(todos).toHaveLength(2);
        expect(todos.every((todo) => todo.userId === ownerUser.id)).toBe(true);
    });
    it('denies inserting a todo for another user', async () => {
        await expect(getTodosCollection(ownerUser).insertOne({
            title: 'Not allowed',
            userId: guestUser.id
        })).rejects.toThrow('Insert not permitted');
    });
    it('allows owners to insert their own todos', async () => {
        const insertResult = await getTodosCollection(ownerUser).insertOne({
            title: 'New owner task',
            userId: ownerUser.id
        });
        expect(insertResult.insertedId).toBeDefined();
        const inserted = (await getTodosCollection(ownerUser).findOne({
            _id: insertResult.insertedId
        }));
        expect(inserted).toBeDefined();
        expect(inserted?.userId).toBe(ownerUser.id);
    });
    it('prevents deleting todos that do not belong to the user', async () => {
        await expect(getTodosCollection(ownerUser).deleteOne({ _id: todoIds.otherUser })).rejects.toThrow('Delete not permitted');
    });
    it('allows deleting owned todos', async () => {
        const deleteResult = (await getTodosCollection(ownerUser).deleteOne({
            _id: todoIds.ownerFirst
        }));
        expect(deleteResult.deletedCount).toBe(1);
    });
    it('limita i profili ai workspace condivisi', async () => {
        const ownerUsers = (await getUsersCollection(ownerUser).find({}).toArray());
        expect(ownerUsers).toHaveLength(1);
        expect(ownerUsers[0].workspaces).toContain('workspace-1');
        expect(ownerUsers[0].userId).toBe(ownerUser.id);
        const guestUsers = (await getUsersCollection(guestUser).find({}).toArray());
        expect(guestUsers).toHaveLength(1);
        expect(guestUsers[0].workspaces).toContain('workspace-2');
        expect(guestUsers[0].userId).toBe(guestUser.id);
        const adminUsers = (await getUsersCollection(adminUser).find({}).toArray());
        expect(adminUsers).toHaveLength(2);
    });
    it('consente di aggiornare il profilo solo al proprietario', async () => {
        const updatedName = 'Owner updated';
        const updateResult = await getUsersCollection(ownerUser).updateOne({ _id: userIds.owner }, { $set: { name: updatedName } });
        expect(updateResult.matchedCount).toBe(1);
        const ownerRecord = (await getUsersCollection(ownerUser).findOne({
            _id: userIds.owner
        }));
        expect(ownerRecord?.name).toBe(updatedName);
        await expect(getUsersCollection(guestUser).updateOne({ _id: userIds.owner }, { $set: { name: 'Hijack' } })).rejects.toThrow('Update not permitted');
    });
    it('blocca l\'accesso alla collection auth_users senza regole', async () => {
        await expect(getAuthUsersCollection(ownerUser).find({}).toArray()).rejects.toThrow('READ FORBIDDEN!');
    });
    it('blocca gli inserimenti su auth_users senza regole', async () => {
        await expect(getAuthUsersCollection(ownerUser).insertOne({
            userId: ownerUser.id,
            email: 'blocked@example.com',
            password: 'xxx'
        })).rejects.toThrow('CREATE FORBIDDEN!');
    });
    it('limits projects to the owner and hides forbidden fields', async () => {
        const projects = (await getProjectsCollection(ownerUser).find({}).toArray());
        expect(projects).toHaveLength(1);
        expect(projects[0].ownerId).toBe(ownerUser.id);
        expect(projects[0]).not.toHaveProperty('secretNotes');
        expect(projects[0]).not.toHaveProperty('internalCode');
        expect(projects[0]).toHaveProperty('summary');
    });
    it('allows owners to update their project summary via function rules', async () => {
        const updateResult = await getProjectsCollection(ownerUser).updateOne({ _id: projectIds.ownerProject }, { $set: { summary: 'Updated summary' } });
        expect(updateResult.matchedCount).toBe(1);
        const updated = (await getProjectsCollection(ownerUser).findOne({
            _id: projectIds.ownerProject
        }));
        expect(updated?.summary).toBe('Updated summary');
    });
    it('prevents guests from updating projects they do not own', async () => {
        await expect(getProjectsCollection(guestUser).updateOne({ _id: projectIds.ownerProject }, { $set: { summary: 'Should be blocked' } })).rejects.toThrow('Update not permitted');
    });
    it('lets admins read all projects and see privileged fields', async () => {
        const projects = (await getProjectsCollection(adminUser).find({}).toArray());
        expect(projects.length).toBeGreaterThanOrEqual(2);
        const ownerProject = projects.find((project) => project.ownerId === ownerUser.id);
        expect(ownerProject).toBeDefined();
        expect(ownerProject).toHaveProperty('secretNotes', 'top secret');
    });
    it('returns only active activity logs for non-admin roles', async () => {
        const logs = (await getActivityLogsCollection(ownerUser).find({}).toArray());
        expect(logs.every((log) => log.status === 'active')).toBe(true);
        expect(logs).toHaveLength(2);
    });
    it('allows admins to read all logs and insert new entries', async () => {
        const logs = (await getActivityLogsCollection(adminUser).find({}).toArray());
        expect(logs.some((log) => log.status === 'inactive')).toBe(true);
        const insertResult = await getActivityLogsCollection(adminUser).insertOne({
            message: 'Admin log',
            status: 'inactive',
            ownerId: adminUser.id
        });
        expect(insertResult.insertedId).toBeDefined();
    });
    it('prevents non-admin users from inserting activity logs', async () => {
        await expect(getActivityLogsCollection(ownerUser).insertOne({
            message: 'Blocked log',
            status: 'inactive',
            ownerId: ownerUser.id
        })).rejects.toThrow('Insert not permitted');
    });
    it('rispetta i filtri workspace/visibility per le attività', async () => {
        const ownerActivities = (await getActivitiesCollection(ownerUser).find({}).toArray());
        expect(ownerActivities).toHaveLength(2);
        expect(ownerActivities.every((activity) => activity.workspace === 'workspace-1')).toBe(true);
        const guestActivities = (await getActivitiesCollection(guestUser).find({}).toArray());
        expect(guestActivities).toHaveLength(1);
        expect(guestActivities[0].workspace).toBe('workspace-2');
    });
    it('limita la scrittura delle attività a proprietario o admin', async () => {
        const newTitle = 'Updated private activity';
        const updateResult = await getActivitiesCollection(ownerUser).updateOne({ _id: activityIds.ownerPrivate }, { $set: { title: newTitle } });
        expect(updateResult.matchedCount).toBe(1);
        const updatedActivity = (await getActivitiesCollection(ownerUser).findOne({
            _id: activityIds.ownerPrivate
        }));
        expect(updatedActivity?.title).toBe(newTitle);
        await expect(getActivitiesCollection(ownerUser).updateOne({ _id: activityIds.ownerPublic }, { $set: { title: 'Blocked change' } })).rejects.toThrow('Update not permitted');
        const adminChange = await getActivitiesCollection(adminUser).updateOne({ _id: activityIds.ownerPublic }, { $set: { title: 'Admin changed' } });
        expect(adminChange.matchedCount).toBe(1);
        const adminActivity = (await getActivitiesCollection(adminUser).findOne({
            _id: activityIds.ownerPublic
        }));
        expect(adminActivity?.title).toBe('Admin changed');
    });
    it('applica i filtri complessi di visibilità sui contatori', async () => {
        const ownerCounters = (await getCountersCollection(ownerUser).find({}).toArray());
        expect(ownerCounters).toHaveLength(3);
        expect(ownerCounters.every((counter) => counter.workspace === 'workspace-1')).toBe(true);
        const guestCounters = (await getCountersCollection(guestUser).find({}).toArray());
        expect(guestCounters).toHaveLength(1);
        expect(guestCounters[0].visibility.users).toContain(guestUser.id);
        const adminCounters = (await getCountersCollection(adminUser).find({}).toArray());
        expect(adminCounters).toHaveLength(4);
    });
    it('richiede privilegi admin per modificare contatori protetti', async () => {
        const ownerUpdate = await getCountersCollection(ownerUser).updateOne({ _id: counterIds.adminOnly }, { $set: { value: 450 } });
        expect(ownerUpdate.matchedCount).toBe(1);
        const ownerCounter = (await getCountersCollection(ownerUser).findOne({
            _id: counterIds.adminOnly
        }));
        expect(ownerCounter?.value).toBe(450);
        await expect(getCountersCollection(guestUser).updateOne({ _id: counterIds.adminOnly }, { $set: { value: 10 } })).rejects.toThrow('Update not permitted');
        const adminUpdate = await getCountersCollection(adminUser).updateOne({ _id: counterIds.adminOnly }, { $set: { value: 500 } });
        expect(adminUpdate.matchedCount).toBe(1);
        const adminCounter = (await getCountersCollection(adminUser).findOne({
            _id: counterIds.adminOnly
        }));
        expect(adminCounter?.value).toBe(500);
    });
    it('attiva il trigger sullo stream di activityLogs e salva il log', async () => {
        const newActivityId = new mongodb_1.ObjectId();
        await getActivityLogsCollection(ownerUser).insertOne({
            _id: newActivityId,
            title: 'Trigger test activity',
            ownerId: ownerUser.id,
            workspace: 'workspace-1',
            visibility: {
                type: 'team'
            }
        });
        const recorded = await waitForTriggerEvent(newActivityId.toString());
        expect(recorded).not.toBeNull();
        expect(recorded?.operationType).toBe('insert');
        expect(recorded?.documentId).toBe(newActivityId.toString());
    });
    it('espone il nuovo endpoint API tramite la funzione dedicata', async () => {
        const response = await appInstance.inject({
            method: 'GET',
            url: '/api/checkWorkspace?workspace=workspace-1'
        });
        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            success: true,
            workspace: 'workspace-1',
            source: 'api_checkWorkspace'
        });
    });
});
//# sourceMappingURL=mongodb-atlas.rules.e2e.test.js.map