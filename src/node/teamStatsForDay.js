const moment = require('moment');
const mongodb = require('mongodb');

const { fetchData } = require('./utils.js');

require('dotenv').config();

const seasonStart = moment([2018, 10 - 1, 16]);
const today = moment();
const daysSinceSeasonStart = today.diff(seasonStart, 'days');

const seasonDates = [...Array(daysSinceSeasonStart)].map((_, i) => {
  const date = seasonStart.clone();
  return date.add(i, 'days').format('l');
});

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

const insertData = (dataToInsert) => {
  const uri = `mongodb://${process.env.DB_USER}:${
    process.env.DB_PASSWORD
  }@ds141043.mlab.com:41043/four-factors`;

  mongodb.MongoClient.connect(
    uri,
    (err, client) => {
      if (err) throw err;

      const db = client.db('four-factors');

      const collection = db.collection('teamStatsByDay');
      collection.insertMany(dataToInsert);

      // Only close the connection when your app is terminating.
      client.close((error) => {
        if (error) throw err;
      });
    },
  );
};

const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

const start = async () => {
  await asyncForEach(seasonDates, async (date) => {
    const teamStatsUrl = `https://stats.nba.com/stats/leaguedashteamstats?Conference=&DateFrom=${seasonStart.format(
      'l',
    )}&DateTo=${date}&Division=&GameScope=&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=2018-19&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=`;
    const teamStats = fetchData(teamStatsUrl).then((r) => {
      return transformTeamStats(r);
    });
    teamStats.then((response) => {
      response.forEach((team) => {
        team.date = date;
      });
      insertData(response);
    });
    console.log(date);
    await waitFor(60000);
  });
};
start();
