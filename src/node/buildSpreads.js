const moment = require('moment');
const mongodb = require('mongodb');

const {
  fetchData,
  getGames,
  teamStatsUrl,
  opponentStatsUrl,
} = require('./utils.js');

require('dotenv').config();

const today = moment();
const yesterday = moment().subtract(1, 'days');

const transformTeamStats = (data) => {
  const { headers } = data;
  const statArr = [];
  data.rowSet.forEach((team) => {
    const statLine = {};
    for (const [index, value] of team.entries()) {
      statLine[headers[index].toLowerCase()] = value;
    }
    statArr.push(statLine);
  });
  return statArr;
};

const teamStats = fetchData(teamStatsUrl).then((r) => {
  return transformTeamStats(r);
});

const teamOpponentStats = fetchData(opponentStatsUrl).then((r) => {
  return transformTeamStats(r);
});

const todayGames = getGames(
  today.format('Y'),
  today.format('M'),
  today.format('D'),
).then((resp) => {
  return resp;
});

const teamsPlayedYesterday = getGames(
  yesterday.format('Y'),
  yesterday.format('M'),
  yesterday.format('D'),
).then((resp) => {
  const home = resp.map((t) => t.home.id);
  const visitor = resp.map((t) => t.visitor.id);
  return [...home, ...visitor];
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

      const collection = db.collection('scheduleWithFourFactors');
      collection.insertMany(dataToInsert);

      // Only close the connection when your app is terminating.
      client.close((error) => {
        if (error) throw err;
      });
    },
  );
};

Promise.all([
  teamStats,
  teamOpponentStats,
  todayGames,
  teamsPlayedYesterday,
]).then((values) => {
  const teamStatsFull = [];
  values[0].forEach((itm, i) => {
    teamStatsFull.push(Object.assign({}, itm, values[1][i]));
  });

  const gamesWithFourFactors = [];
  values[2].forEach((game) => {
    const gameDetail = {
      id: game.id,
      season_id: game.season_id,
      date: game.date,
      time: game.time,
      home: game.home,
      visitor: game.visitor,
    };

    // Based on list of teams that played yesterday (by ID) see if either
    // home or away team is on a b2b and if so flag it
    gameDetail.home.b2b = values[3].some((teamId) => teamId === game.home.id);
    gameDetail.visitor.b2b = values[3].some(
      (teamId) => teamId === game.visitor.id,
    );

    const homeTeamStats = teamStatsFull.find((x) => x.team_id == game.home.id);
    const visitorTeamStats = teamStatsFull.find(
      (x) => x.team_id == game.visitor.id,
    );

    console.log(homeTeamStats);

    gameDetail.home.record = `${homeTeamStats.w}-${homeTeamStats.l}`;
    gameDetail.visitor.record = `${visitorTeamStats.w}-${visitorTeamStats.l}`;

    const homeFourFactors = {
      TS:
        homeTeamStats.pts /
        (2 * (homeTeamStats.fga + 0.44 * homeTeamStats.fta)),
      TSopp:
        homeTeamStats.opp_pts /
        (2 * (homeTeamStats.opp_fga + 0.44 * homeTeamStats.opp_fta)),
      TOV:
        homeTeamStats.tov /
        (homeTeamStats.fga + 0.44 * homeTeamStats.fta + homeTeamStats.tov),
      TOVopp:
        homeTeamStats.opp_tov /
        (homeTeamStats.opp_fga +
          0.44 * homeTeamStats.opp_fta +
          homeTeamStats.opp_tov),
      ORB: homeTeamStats.oreb / (homeTeamStats.oreb + homeTeamStats.opp_dreb),
      DRB: homeTeamStats.dreb / (homeTeamStats.opp_oreb + homeTeamStats.dreb),
    };
    const visitorFourFactors = {
      TS:
        visitorTeamStats.pts /
        (2 * (visitorTeamStats.fga + 0.44 * visitorTeamStats.fta)),
      TSopp:
        visitorTeamStats.opp_pts /
        (2 * (visitorTeamStats.opp_fga + 0.44 * visitorTeamStats.opp_fta)),
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
    };

    const homeWeights = {
      TS: (homeFourFactors.TS - homeFourFactors.TSopp) * 100,
      tov: homeFourFactors.TOVopp * 100 - homeFourFactors.TOV * 100,
      orb: homeFourFactors.ORB * 100 - (100 - homeFourFactors.DRB * 100),
    };
    const visitorWeights = {
      TS: (visitorFourFactors.TS - visitorFourFactors.TSopp) * 100,
      tov: visitorFourFactors.TOVopp * 100 - visitorFourFactors.TOV * 100,
      orb: visitorFourFactors.ORB * 100 - (100 - visitorFourFactors.DRB * 100),
    };

    const model = {
      efg: (homeWeights.TS - visitorWeights.TS) * 0.7,
      tov: (homeWeights.tov - visitorWeights.tov) * 0.15,
      orb: (homeWeights.orb - visitorWeights.orb) * 0.15,
    };
    const predictedLine = (model.efg + model.tov + model.orb) * 2;

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
  // if (gamesWithFourFactors.length) {
  //   insertGames(gamesWithFourFactors);
  // }
  gamesWithFourFactors.forEach((game) => {
    console.log(game.visitor.nickname, game.line.visitor.predicted);
    console.log(game.home.nickname, game.line.home.predicted);
    console.log('*************************');
  });
});
