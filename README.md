## bos-couchdb
[![Build Status](https://travis-ci.org/BlueOakJS/bos-couchdb.svg?branch=master)](https://travis-ci.org/BlueOakJS/bos-couchdb)
[![npm version](https://img.shields.io/npm/v/bos-couchdb.svg)](https://www.npmjs.com/package/bos-couchdb)

This is a [CouchDB](https://couchdb.apache.org/) service for [BlueOak Server](https://github.com/BlueOakJS/blueoak-server).
The service provides a convenient way of accessing couchdb servers through BlueOak Server.
Under the covers the service uses [nano](https://github.com/dscape/nano).

### Installation

```bash
$ npm install bos-couchdb
```

### Configuration

This service can be configured through the _couchdb_ field of the BlueOak Server config.

#### Connections
Connections are named based on key specified in the `connections` section of the couchdb config block.
The configuration below defines two connections, one to a remote Cloudant server named _cloudant_ and another to a local couchdb server name _local_.

#### Databases
Each connection can include on more databases defined in the `databases` field of the connection.
The key used will correspond to the name of an actual database on the couchdb server.
The configuration below defines two databases: _profiles_ belonging to the cloudant connection, and _devices_ belonging to the local connection.

```json
"couchdb": {
  "connections": {
    "cloudant": {
      "url": "https://example.cloudant.com/",
      "username": "foo",
      "password": "passw0rd",
      "databases": {
        "profiles": {}
      }
    },
    "local": {
      "url": "http://127.0.0.1:5984/",
      "databases": {
        "devices": {}
      }
    }
  }
}
```

#### Scoped Config Options

Scoped config are options that can be set on the root couchdb object, the connection, or the database.
The database-specific value has precedence over the connection-specific value.
The connection-specific value has precedence over the root value.

This allows the definition of global values that can be overridden as desired.

Valid options are:
* *validateConnection* (default true) - verify the ability to connect to the database when the server starts.
* *createDatabase* (default false) - attempt to create the database if it doesn't exist when the server starts.

### Usage

The bo-couchdb service can be injected into services or handlers through a `boCouchdb` parameter on the init method.

```js
exports.init = function(config, logger, boCouchdb) {
  ...
}
```

#### getConnection(connectionName)
The `getConnection` function will return a named connection where _connectionName_ corresponds to a connection specified in the configuration.
The nano [database](https://github.com/dscape/nano#database-functions) functions can be used on the connection object.

```js
var conn = boCouchdb.getConnection('local');
conn.list(function(err, results) {
  //results is a list of databases on the connection
});
```

#### get(dbName)
The `get` function will return a database where dbName corresponds to a database defined in the configuration.
The nano [document](https://github.com/dscape/nano#document-functions) functions can be used on the db object.

```js
var profilesDb = boCouchdb.get('profiles');
profilesDb.get('foo' /*doc id*/, function(err, body) {
  if (!err)
    console.log(body);
});
```

Since it's possible that more than one connection will share a database name, the database name can be prefixed with the connection name.
This will avoid any possible ambiguity in looking up a database.

```js
var profilesDb = boCouchdb.get('cloudant:profiles');
var devicesDb = boCouchdb.get('local:devices');
```



