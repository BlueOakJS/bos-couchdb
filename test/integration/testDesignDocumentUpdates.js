var assert = require('assert');
var server = require('blueoak-server');
var fs = require('fs');
var testUtil = server.testUtility();
global.__appDir = __dirname;

/**
 * You MUST have couchdb running locally with a database called 'basic' in order for these tests to work
 */
describe('CouchDB Integration Test', function () {

    beforeEach(function () {
        couchdb = require('../../');
    });

    afterEach(function () {
        //clean up couchdb
        var name = require.resolve('../../');
        delete require.cache[name];
        name = require.resolve('./couchdb/test/basic/example');
        delete require.cache[name];
    });

    it('should update design document', function (done) {
        var cfg = {
            couchdb: {
                connections: {
                    test: {
                        url: 'http://127.0.0.1:5984',
                        databases: {
                            basic: {}
                        }
                    }
                }
            }
        };
        var randomId = Math.random();
        fs.writeFileSync('./couchdb/test/basic/example.json', '{"views" : {}, "generatedId": "' + randomId + '"}');
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            couchdb.updateDesigns(['test.basic.example']).then(function (results) {
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
                            basic: {} //returns 200 by nock
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
                            basic: {}
                        }
                    }
                }
            }
        };
        var randomId = Math.random();
        fs.writeFileSync('./couchdb/test/basic/example.json', '{"views" : {}, "generatedId": "' + randomId + '"}');
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            couchdb.updateDesigns(['test.basic.example', 'test.non-existent-db.example']).then(function (results) {
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
                            basic: {updateDesigns: true},
                            'non-existent-db': {validateConnection: false}
                        }
                    }
                }
            }
        };
        var randomId = Math.random();
        fs.writeFileSync('./couchdb/test/basic/example.json', '{"views" : {}, "generatedId": "' + randomId + '"}');
        testUtil.initService(couchdb, cfg, function (err) {
            if (err) {
                return done(err);
            }
            done();
        });
    });
});