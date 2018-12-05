const mongodb = require('mongodb');

require('dotenv').config();

const uri = `mongodb://${process.env.DB_USER}:${
  process.env.DB_PASSWORD
}@ds141043.mlab.com:41043/four-factors`;

mongodb.MongoClient.connect(
  uri,
  (err, client) => {
    if (err) throw err;

    const db = client.db('four-factors');

    const testingCollection = db.collection('scheduleWithFourFactorsTesting');
    const liveCollection = db.collection('scheduleWithFourFactors');

    testingCollection.find().forEach((testingDoc) => {
      liveCollection.findOne({ id: testingDoc.id }).then((liveDoc) => {
        if (liveDoc != null) {
          if ('line' in liveDoc) {
            testingDoc.line.home.actual = liveDoc.line.home.actual;
            testingCollection.save(testingDoc);
          }
        }
      });
    });
  },
);
