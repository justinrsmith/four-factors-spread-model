const moment = require('moment');
const mongodb = require('mongodb');

const { getGames } = require('./utils.js');

require('dotenv').config();

const yesterday = moment().subtract(1, 'days');

const yesterdayGames = getGames(
  yesterday.format('Y'),
  yesterday.format('M'),
  yesterday.format('D'),
).then((resp) => {
  return resp;
});

const updateScores = (data) => {
  const uri = `mongodb://${process.env.DB_USER}:${
    process.env.DB_PASSWORD
  }@ds141043.mlab.com:41043/four-factors`;
  mongodb.MongoClient.connect(
    uri,
    (err, client) => {
      if (err) throw err;

      const db = client.db('four-factors');

      const collection = db.collection('scheduleWithFourFactors');
      data.forEach((obj) => {
        collection.updateOne(
          { id: obj.id },
          {
            $set: {
              'home.score': obj.home.score,
              'visitor.score': obj.visitor.score,
            },
            $currentDate: { updatedAt: true },
          },
        );
      });
      // Only close the connection when your app is terminating.
      client.close((error) => {
        if (error) throw err;
      });
    },
  );
};

yesterdayGames.then((r) => updateScores(r));
