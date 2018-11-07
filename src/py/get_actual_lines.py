import os
import re
from datetime import datetime

from bs4 import BeautifulSoup
import pymongo
import requests

from nba_to_espn_mapping import get_espn_team_name

rows = []
res = requests.get('http://www.espn.com/nba/lines/_/date')
soup = BeautifulSoup(res.text, 'html.parser')

games_with_lines = []

for game_name in soup.findAll("tr", {"class": "stathead"}):
    for name in game_name.findAll('td'):
        game_full = name.get_text().split(',')[0]
        games_with_lines.append({game_full: None})

counter = 0
for sportsbook in soup.findAll("tr", {"class": "evenrow"}):
    # Caesar sportsbook will be closest to Bovada
    if 'Caesar' in sportsbook.get_text():
        for line in sportsbook.findAll('td')[2:3]:
            for k, v in games_with_lines[counter].items():
                games_with_lines[counter][k] = line.get_text()
        counter = counter + 1

for d in games_with_lines:
    for k, v in d.items():
        visitor_operator = d[k][0]
        if visitor_operator == '+':
            home_operator = '-'
        else:
            home_operator = '+'
        line_numbers = re.split(r'[+-]+', d[k])
        if 'N/A' not in line_numbers:
            d[k] = {
                'visitor_line': visitor_operator+line_numbers[1],
                'home_line': home_operator+line_numbers[2]
            }

final = []
for game in games_with_lines:
    for k, v in game.items():
        sp = k.split('at')
        if not game[k] == 'N/A':
            final.append({
                'home': {
                    'team_name': sp[1].strip(),
                    'line': game[k]['home_line']
                },
                'visitor': {
                    'team_name': sp[0].strip(),
                    'line': game[k]['visitor_line']
                },
                'date': datetime.now().strftime('%Y%m%d')
            })

uri = \
    f'mongodb://four_factor_user:{os.environ['MLAB_USER']}@{os.environ['MLAB_PW']}.mlab.com:41043/four-factors'

client = pymongo.MongoClient(uri)
db = client['four-factors']
collection = db['scheduleWithFourFactors']
cursor = collection.find({'date': datetime.now().strftime('%Y%m%d')})
for doc in cursor:
    home_team = get_espn_team_name(doc['home']['id'])
    visitor_team = get_espn_team_name(doc['visitor']['id'])
    for f in final:
        if f['home']['team_name'] == home_team:
            doc['line']['home']['actual'] = f['home']['line']
        if f['visitor']['team_name'] == visitor_team:
            doc['line']['visitor']['actual'] = f['visitor']['line']
    collection.save(doc)
client.close()
