const moment = require('moment');
const mongodb = require('mongodb');

require('dotenv').config();

const seasonStart = moment([2018, 10 - 1, 16]);
const today = moment();
const daysSinceSeasonStart = today.diff(seasonStart, 'days');

const seasonDates = [...Array(daysSinceSeasonStart)].map((_, i) => {
  const date = seasonStart.clone();
  return date.add(i, 'days').format('l');
});

const insertGames = (dataToInsert) => {
  const uri = `mongodb://${process.env.DB_USER}:${
    process.env.DB_PASSWORD
  }@ds141043.mlab.com:41043/four-factors`;

  mongodb.MongoClient.connect(
    uri,
    (err, client) => {
      if (err) throw err;

      const db = client.db('four-factors');

      const collection = db.collection('scheduleWithFourFactorsTesting');
      collection.insertMany(dataToInsert);

      // Only close the connection when your app is terminating.
      client.close((error) => {
        if (error) throw err;
      });
    },
  );
};

const getDataFromDb = (collectionToUse, date) => {
  const uri = `mongodb://${process.env.DB_USER}:${
    process.env.DB_PASSWORD
  }@ds141043.mlab.com:41043/four-factors`;

  return mongodb.MongoClient.connect(uri)
    .then((client) => {
      const db = client.db('four-factors');
      const collection = db.collection(collectionToUse);

      return collection
        .find({
          date: moment(date, 'l')
            .subtract(1, 'days')
            .format('MM/D/YYYY'),
        })
        .toArray();
    })
    .then((items) => {
      return items;
    });
};

const getGames = (date) => {
  const uri = `mongodb://${process.env.DB_USER}:${
    process.env.DB_PASSWORD
  }@ds141043.mlab.com:41043/four-factors`;

  return mongodb.MongoClient.connect(uri)
    .then((client) => {
      const db = client.db('four-factors');
      const collection = db.collection('scheduleWithFourFactors');
      const dateFmtted = moment(date, 'MM/DD/YYYY').format('YYYYMMDD');
      console.log(dateFmtted);
      return collection.find({ date: dateFmtted }).toArray();
    })
    .then((items) => {
      return items;
    });
};

const execute = (date) => {
  const teamStats = getDataFromDb('teamStatsByDay', date).then((r) => {
    return r;
  });
  const teamOpponentStats = getDataFromDb('teamOpponentStatsByDay', date).then(
    (r) => {
      return r;
    },
  );
  const todayGames = getGames(date).then((r) => {
    return r;
  });

  Promise.all([teamStats, teamOpponentStats, todayGames]).then((values) => {
    const gamesWithFourFactors = [];
    if (values[2].length) {
      const teamStatsFull = [];
      values[0].forEach((itm, i) => {
        teamStatsFull.push(Object.assign({}, itm, values[1][i]));
      });

      values[2].forEach((game) => {
        const gameDetail = {
          id: game.id,
          season_id: game.season_id,
          date: game.date,
          time: game.time,
          home: game.home,
          visitor: game.visitor,
        };

        const homeTeamStats = teamStatsFull.find(
          (x) => x.team_id == game.home.id,
        );
        const visitorTeamStats = teamStatsFull.find(
          (x) => x.team_id == game.visitor.id,
        );

        const homeFourFactors = {
          eFG:
            (homeTeamStats.fgm + 0.5 * homeTeamStats.fg3m) / homeTeamStats.fga,
          eFGopp:
            (homeTeamStats.opp_fgm + 0.5 * homeTeamStats.opp_fg3m) /
            homeTeamStats.opp_fga,
          TOV:
            homeTeamStats.tov /
            (homeTeamStats.fga + 0.44 * homeTeamStats.fta + homeTeamStats.tov),
          TOVopp:
            homeTeamStats.opp_tov /
            (homeTeamStats.opp_fga +
              0.44 * homeTeamStats.opp_fta +
              homeTeamStats.opp_tov),
          ORB:
            homeTeamStats.oreb / (homeTeamStats.oreb + homeTeamStats.opp_dreb),
          DRB:
            homeTeamStats.dreb / (homeTeamStats.opp_oreb + homeTeamStats.dreb),
          FG_FGA: homeTeamStats.ftm / homeTeamStats.fga,
          FG_FGAopp: homeTeamStats.opp_ftm / homeTeamStats.opp_fga,
        };
        const visitorFourFactors = {
          eFG:
            (visitorTeamStats.fgm + 0.5 * visitorTeamStats.fg3m) /
            visitorTeamStats.fga,
          eFGopp:
            (visitorTeamStats.opp_fgm + 0.5 * visitorTeamStats.opp_fg3m) /
            visitorTeamStats.opp_fga,
          TOV:
            visitorTeamStats.tov /
            (visitorTeamStats.fga +
              0.44 * visitorTeamStats.fta +
              visitorTeamStats.tov),
          TOVopp:
            visitorTeamStats.opp_tov /
            (visitorTeamStats.opp_fga +
              0.44 * visitorTeamStats.opp_fta +
              visitorTeamStats.opp_tov),
          ORB:
            visitorTeamStats.oreb /
            (visitorTeamStats.oreb + visitorTeamStats.opp_dreb),
          DRB:
            visitorTeamStats.dreb /
            (visitorTeamStats.opp_oreb + visitorTeamStats.dreb),
          FG_FGA: visitorTeamStats.ftm / visitorTeamStats.fga,
          FG_FGAopp: visitorTeamStats.opp_ftm / visitorTeamStats.opp_fga,
        };

        const homeWeights = {
          efg: (homeFourFactors.eFG - homeFourFactors.eFGopp) * 100,
          tov: homeFourFactors.TOVopp * 100 - homeFourFactors.TOV * 100,
          orb: homeFourFactors.ORB * 100 - (100 - homeFourFactors.DRB * 100),
          fta: (homeFourFactors.FG_FGA - homeFourFactors.FG_FGAopp) * 100,
        };
        const visitorWeights = {
          efg: (visitorFourFactors.eFG - visitorFourFactors.eFGopp) * 100,
          tov: visitorFourFactors.TOVopp * 100 - visitorFourFactors.TOV * 100,
          orb:
            visitorFourFactors.ORB * 100 - (100 - visitorFourFactors.DRB * 100),
          fta: (visitorFourFactors.FG_FGA - visitorFourFactors.FG_FGAopp) * 100,
        };

        const model = {
          efg: (homeWeights.efg - visitorWeights.efg) * 0.4,
          tov: (homeWeights.tov - visitorWeights.tov) * 0.25,
          orb: (homeWeights.orb - visitorWeights.orb) * 0.2,
          fta: (homeWeights.fta - visitorWeights.fta) * 0.15,
        };
        const predictedLine =
          (model.efg + model.tov + model.orb + model.fta) * 2;

        gameDetail.home.fourFactors = homeFourFactors;
        gameDetail.visitor.fourFactors = visitorFourFactors;
        gameDetail.predictedLine = predictedLine;

        let homePredictedLine = '';
        let visitorPredictedLine = '';
        if (predictedLine > 0) {
          visitorPredictedLine = `+${predictedLine.toFixed(1)}`;
          homePredictedLine = `${(predictedLine * -1).toFixed(1)}`;
        } else {
          visitorPredictedLine = `${predictedLine.toFixed(1)}`;
          homePredictedLine = `+${(predictedLine * -1).toFixed(1)}`;
        }

        gameDetail.line = {
          home: {
            actual: null,
            predicted: homePredictedLine,
          },
          visitor: {
            actual: null,
            predicted: visitorPredictedLine,
          },
        };
        gamesWithFourFactors.push(gameDetail);
      });
    }

    // gamesWithFourFactors.forEach((game) => {
    //   console.log(game.visitor.nickname, game.line.visitor.predicted);
    //   console.log(game.home.nickname, game.line.home.predicted);
    //   console.log('*************************');
    // });
    if (gamesWithFourFactors.length) {
      insertGames(gamesWithFourFactors);
    }
  });
};

seasonDates.forEach((date) => {
  execute(date);
});
