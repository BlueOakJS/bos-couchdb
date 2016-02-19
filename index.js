/*
 * Copyright (c) 2016 PointSource, LLC.
 * MIT Licensed
 */
var async = require('async');
var nano = require('nano');
var URL = require('url');
var VError = require('verror');
var _ = require('lodash');
var debug = require('debug')('couchdb');

var connections = {}; //map connection name to the db object
var dbMap = {}; //map with key "<connName>:<dbName>" and value is the db object
var dbByName = {}; //used to look up a database without a connection name.  Looks like
//<dbName>: {
//  <connName1>: <DB Object>,
//  <connName2>: <DB Object>
// }

var cfg, logger;

exports.init = function (config, _logger_, callback) {

    logger = _logger_;
    cfg = config.get('couchdb');

    var conns = _.keys(cfg.connections);
    debug('Initializing connections ' +  conns);
    async.forEach(conns, initConnection, function (err, res) {
        callback(err);
    });
};

//return the db connection (nano) object directly
exports.getConnection = function (connName) {
    return connections[connName];
};

exports.getConnections = function() {
    return connections;
};

/*
 * Get a database connection.
 * The name can either be of the form "<connName>:<dbName>", e.g. "myCloudantDb:users"
 * Or it can simply be the db name, e.g. "users".
 * In the case that there are two connections
 */
exports.get = function (name) {
    debug('Getting database ' + name);

    if (name.indexOf(':') > -1) {
        return dbMap[name];
    } else { //no connection info specified
        var conns = dbByName[name];
        var keys = _.keys(conns);

        if (keys.length > 1) {
            throw new VError('The database name "%s" is ambiguous for connections %s.', name, keys.join(', '));
        }

        return conns[keys[0]];
    }
};

function initConnection(connName, callback) {

    var connCfg = cfg.connections[connName];
    var url = connCfg.url;

    //embed the username and password into the URL, e.g. http://<username>:<password>@...
    if (connCfg.username && connCfg.password) {
        var urlData = URL.parse(url);
        if (urlData.auth === null) {
            urlData.auth = connCfg.username + ':' + connCfg.password;
            url = URL.format(urlData);
        }
    }
    var conn = nano(url);
    connections[connName] = conn;

    var dbs = _.keys(connCfg.databases) || [];

    async.each(dbs, getVerifyDatabase(connName), function (err) {
        callback(err);
    });
}

function getVerifyDatabase(connName) {
    return function (dbName, callback) {
        debug('Verifying database ' + dbName + ' of connection ' + connName);
        var conn = connections[connName];
        conn.db.get(dbName, function (err, body) {
            if (err) {
                return callback(new VError(err, 'Could not connect to DB %s of connection %s', dbName, connName));
            } else {

                //store the db object in appropriate places
                var db = conn.use(dbName);
                dbMap[connName + ':' + dbName] = db;
                if (typeof dbByName[dbName] === 'undefined') {
                    dbByName[dbName] = {};
                } else {
                    logger.warn('Multiple databases are using the name "%s"', dbName);
                }

                dbByName[dbName][connName] = db;
                return callback();
            }
        });
    };
}