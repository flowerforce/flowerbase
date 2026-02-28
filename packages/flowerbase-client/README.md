# @flowerforce/flowerbase-client

Client TypeScript leggero per usare Flowerbase con API in stile Realm:

- autenticazione (`local-userpass`, `anon-user`, `custom-function`)
- chiamate funzioni (`user.functions.<name>(...)`)
- accesso a MongoDB Atlas service (`user.mongoClient("mongodb-atlas")`)
- change stream via `watch()` con async iterator
- supporto BSON/EJSON (`ObjectId`, `Date`, ecc.)

## Installazione

```bash
npm i @flowerforce/flowerbase-client
```

## Quick start

```ts
import { App, Credentials } from '@flowerforce/flowerbase-client'

const app = new App({
  id: 'my-app-id',
  baseUrl: 'http://localhost:8000',
  timeout: 10000
})

await app.logIn(Credentials.emailPassword('user@example.com', 'secret'))

const user = app.currentUser
if (!user) throw new Error('User not logged in')

const result = await user.functions.myFunction('hello')
console.log(result)
```

## Configurazione `App`

```ts
new App({
  id: string,          // app id Flowerbase
  baseUrl: string,     // URL base backend (es: http://localhost:8000)
  timeout?: number     // default 10000
})
```

## Autenticazione

### Local user/pass

```ts
await app.logIn(Credentials.emailPassword(email, password))
```

### Anonymous

```ts
await app.logIn(Credentials.anonymous())
```

### Custom function auth

```ts
await app.logIn(
  Credentials.function({
    username: 'demo',
    pin: '1234'
  })
)
```

### Utility `emailPasswordAuth`

```ts
await app.emailPasswordAuth.registerUser({ email, password })
await app.emailPasswordAuth.sendResetPasswordEmail(email)
await app.emailPasswordAuth.callResetPasswordFunction(email, newPassword, extraArg1, extraArg2)
await app.emailPasswordAuth.resetPassword({ token, tokenId, password })
```

## Current user

Dopo il login:

```ts
const user = app.currentUser
```

Interfaccia principale:

- `user.id`
- `user.functions.<functionName>(...args)`
- `user.mongoClient('mongodb-atlas')`
- `user.refreshAccessToken()`
- `user.refreshCustomData()`
- `user.logOut()`

## Funzioni server

```ts
const response = await user.functions.calculateScore({ workspaceId: 'w1' })
```

Le risposte sono normalizzate lato client per gestire payload JSON/EJSON.

## Mongo service

```ts
const mongo = user.mongoClient('mongodb-atlas')
const collection = mongo.db('mydb').collection('todos')

const one = await collection.findOne({ done: false })
const many = await collection.find({ done: false })

await collection.insertOne({ title: 'Task', createdAt: new Date() })
await collection.updateOne({ title: 'Task' }, { $set: { done: true } })
await collection.deleteOne({ title: 'Task' })
```

Metodi disponibili su `collection`:

- `find(query?, options?)`
- `findOne(query?, options?)`
- `insertOne(document, options?)`
- `updateOne(filter, update, options?)`
- `updateMany(filter, update, options?)`
- `deleteOne(filter, options?)`
- `watch(pipeline?, options?)`

## Watch / Change streams

`watch()` restituisce un async iterator con reconnect automatico e metodo `close()`.

```ts
const stream = collection.watch()

try {
  for await (const change of stream) {
    console.log(change)
  }
} finally {
  stream.close()
}
```

## BSON / EJSON

Il client esporta anche:

```ts
import { BSON, EJSON, ObjectId, ObjectID } from '@flowerforce/flowerbase-client'
```

Il layer Mongo client serializza query/opzioni con EJSON e deserializza le risposte, così tipi BSON come `ObjectId` e `Date` restano coerenti con l'uso Realm-like.

## Sessione

La sessione (`accessToken`, `refreshToken`, `userId`) viene salvata con chiave:

- `flowerbase:<appId>:session`

Storage usato:

- `localStorage` se disponibile (browser)
- memory store fallback (ambienti senza `localStorage`)

Su bootstrap dell'app viene tentato un refresh automatico dell'access token usando il refresh token salvato.

## Logout

```ts
await user.logOut()
```

Invia `DELETE /auth/session` con refresh token e pulisce la sessione locale.

## Tipi esportati

- `AppConfig`
- `CredentialsLike`
- `UserLike`
- `MongoClientLike`
- `CollectionLike`
- `WatchAsyncIterator`

## Build e test (workspace)

```bash
npm run build --workspace @flowerforce/flowerbase-client
npm run test --workspace @flowerforce/flowerbase-client
```

Oppure dal package:

```bash
npm run build
npm test
```
