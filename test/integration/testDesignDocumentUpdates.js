var assert = require('assert');
var server = require('blueoak-server');
var fs = require('fs');
var path = require('path');
var testUtil = server.testUtility();

var couchdbModulePath = path.resolve(__dirname, '../..'),
    bosCouchdbTestExampleConfig = path.resolve(__dirname, 'couchdb/test/bos-couchdb-test/example.json');

/**
 * You MUST have couchdb running locally with a database called 'bos-couchdb-test' in order for these tests to work
 */
describe('CouchDB Integration Test', function () {
    
    var couchdb;
    
    before(function () {
        global.__appDir = __dirname;
    });

    beforeEach(function () {
        couchdb = require(couchdbModulePath);
    });

    afterEach(function () {
        //clean up couchdb
        var name = require.resolve(couchdbModulePath);
        delete require.cache[name];
        name = require.resolve(bosCouchdbTestExampleConfig);
        delete require.cache[name];
    });
    
    after(function () {
        // restore the test data to its default value
        _writeTestExample(1);
    });

    it('should update design document', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://127.0.0.1:5984',
                        databases: {
                            'bos-couchdb-test': {}
                        }
                    }
                }
            }
        };
        _writeTestExample(Math.random());
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            couchdb.updateDesigns(['test.bos-couchdb-test.example']).then(function (results) {
                try {
                    assert.equal(results.length, 1);
                    assert.ok(results[0].reason === undefined, 'promise rejected with reason: ' + results[0].reason);
                    assert.ok(results[0].value.match(/updated to revision/), 'did not get expected message "updated to revision", actual message: ' + results[0].value);
                    done();
                } catch (err) {
                    done(err);
                }
            }, function (err) {
                done(err);
            });
        });
    });

    it('should find that local and remote design documents are identical', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://127.0.0.1:5984',
                        databases: {
                            'bos-couchdb-test': {}
                        }
                    }
                }
            }
        };
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            couchdb.updateDesigns().then(function (results) {
                try {
                    assert.equal(results.length, 1);
                    assert.ok(results[0].reason === undefined, 'promise rejected with reason: ' + results[0].reason);
                    assert.ok(results[0].value.match(/are identical/), 'did not get expected message "are identical", actual message: ' + results[0].value);
                    done();
                } catch (err) {
                    done(err);
                }
            }, function (err) {
                done(err);
            });
        });
    });

    it('should update one doc where second doc fails', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://127.0.0.1:5984',
                        databases: {
                            'bos-couchdb-test': {}
                        }
                    }
                }
            }
        };
        _writeTestExample(Math.random());
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            couchdb.updateDesigns(['test.bos-couchdb-test.example', 'test.non-existent-db.example']).then(function (results) {
                try {
                    assert.equal(results.length, 2);
                    assert.ok(results[0].value.match(/updated to revision/), 'did not get expected message "updated to revision", actual message: ' + results[0].value);
                    assert.ok(results[1].reason.message.match(/Unknown Database/), 'did not get the unknown database error that we expected with a DB that was not configured');
                    done();
                } catch (err) {
                    done(err);
                }
            }, function (err) {
                done(err);
            });
        });
    });

    it('should initialize service with updateDesigns set to true', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://127.0.0.1:5984',
                        databases: {
                            'bos-couchdb-test': {updateDesigns: true},
                            'non-existent-db': {validateConnection: false}
                        }
                    }
                }
            }
        };
        _writeTestExample(Math.random());
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            done();
        });
    });
});

function _writeTestExample(id) {
    fs.writeFileSync(bosCouchdbTestExampleConfig, '{"views" : {}, "generatedId": "' + id + '"}');
}
