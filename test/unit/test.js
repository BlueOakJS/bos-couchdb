
var assert = require('assert');
var server = require('blueoak-server');
var _ = require('lodash');
var testUtil = server.testUtility();

var couchdb = null;

var nock = require('nock');

//handle couchdb requests
//*.example.com should return 200 for /users db and 404 for /foo
nock(/.example\.com/)
    .get('/users')
    .reply(200, {})
    .get('/foo')
    .reply(404);


describe('CouchDB Init Test', function () {

    beforeEach(function() {
        couchdb = require('../../');
    });

    afterEach(function() {
        //clean up couchdb
        var name = require.resolve('../../');
        delete require.cache[name];
    });

    it('When using empty config the service should have no connections', function (done) {

        var cfg = {
            couchdb: {}
        };
        testUtil.initService(couchdb, cfg, function(err) {
            if (err) {
                return done(err);
            }
            assert.equal(_.keys(couchdb.getConnections()).length, 0);
            return done();
        });
    });

    it('When specifying an empty connection list, the service should have no connections', function (done) {

        var cfg = {
            couchdb: {
                connections: {}
            }
        };
        testUtil.initService(couchdb, cfg, function(err) {
            if (err) {
                return done(err);
            }
            assert.equal(_.keys(couchdb.getConnections()).length, 0);
            return done();
        });
    });

    it('Using getConnection should return null for an invalid connection name', function (done) {

        var cfg = {
            couchdb: {
                connections: {}
            }
        };
        testUtil.initService(couchdb, cfg, function(err) {
            if (err) {
                return done(err);
            }
            assert.equal(couchdb.getConnection('foo', null));
            return done();
        });
    });

    it('Using getConnection should return a valid connection when configured correctly', function (done) {

        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://couchdb.example.com'
                    }
                }
            }
        };
        testUtil.initService(couchdb, cfg, function(err) {
            if (err) {
                return done(err);
            }

            assert(couchdb.getConnection('test') != null, 'test connection should be defined');
            return done();
        });
    });

    it('Service should create an error for a non-existent database', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://couchdb.example.com',
                        databases: {
                            foo: {} //returns 404 by nock
                        }
                    }
                }
            }
        };
        testUtil.initService(couchdb, cfg, function(err) {
            assert(err != null, 'error should exists');
            done();
        });
    });

    it('Should be able to look up a database by name and connection', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://couchdb.example.com',
                        databases: {
                            users: {} //returns 200 by nock
                        }
                    }
                }
            }
        };
        testUtil.initService(couchdb, cfg, function(err) {
            if (err) {
                return done(err);
            }
            assert(couchdb.get('users') != null, 'db exists');
            assert(couchdb.get('test:users') != null, 'db exists');
            done();
        });
    });

    it('Looking up an ambiuously defined database should result in an error', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://couchdb.example.com',
                        databases: {
                            users: {} //returns 200 by nock
                        }
                    },
                    test2: {
                        url: 'http://couchdb2.example.com',
                        databases: {
                            users: {} //returns 200 by nock
                        }
                    }
                }
            }
        };
        testUtil.initService(couchdb, cfg, function(err) {
            if (err) {
                return done(err);
            }

            //throws an error with a message about being ambiguous
            assert.throws(
                function() {
                    couchdb.get('users');
                }, /ambiguous/
            );

            done();
        });
    });

    it('Ambiuously defined database can be looked up using connection name', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://couchdb.example.com',
                        databases: {
                            users: {} //returns 200 by nock
                        }
                    },
                    test2: {
                        url: 'http://couchdb2.example.com',
                        databases: {
                            users: {} //returns 200 by nock
                        }
                    }
                }
            }
        };
        testUtil.initService(couchdb, cfg, function(err) {
            if (err) {
                return done(err);
            }

            var db = couchdb.get('test:users');
            assert(db != null, 'Found database');
            done();
        });
    });
});
