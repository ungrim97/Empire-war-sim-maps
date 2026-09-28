'use strict';

const xml2json = require('xml2json');
const fs = require('fs/promises');
const {v5: uuid} = require('uuid');

const barbTerritories = (name) => {
    return [
        // Thule
        'Skuld',
        'Verthandi',
        'Nithoggir',
        'Urdur',
        // Druj
        'Jaffna',
        'Darkwoods',
        'Matale',
        'The Barrens',
        // Suranni
        'Veroigne',
        'Shavronne',
        'Reinos',
        'Kalino',
        // Jotun
        'Tromsa',
        'Bryadvik',
        'Skallahn',
        'Hordalant',
        'Ankashun',
        // Grendel
        'Tathar',
        'Shayeel',
        'Raineach',
        'Ayereed',
        'Mareave',
        // Faraden
        'tujahan',
        'Menendram',
        // Unknown
        'Fjorknae',
    ].includes(name);
};

const extractTerritoriesFromRawSvg = async () => {
    const file = await fs.readFile('./maps/Empire-raw.svg');
    const svgData = xml2json.toJson(file, {object: true});

    const regions = svgData.svg.g.g;
    const territories = svgData.svg.g.path;

    const regionMap = regions.reduce((map, regionGroup) => {
        const territoryName = regionGroup['inkscape:label'] ?? regionGroup.id;

        map[territoryName] = regionGroup.path.map((region) => {
            const regionName = region['inkscape:label'] ?? region.id;
            return {
                regionName,
                path: region.d,
                id: uuid(`TERRITORY/${territoryName}/REGION/${regionName}`, uuid.URL),
            };
        });

        return map;
    }, {});

    const territoriesList = territories.map((territory) => {
        const territoryName = territory['inkscape:label'] ?? territory.id;

        // Ignore territories with no regions
        if (!regionMap[territoryName]) return null;

        return {
            territoryName,
            path: territory.d,
            id: uuid(`TERRITORY/${territoryName}`, uuid.URL),
            regions: regionMap[`${territoryName}-Alt`] ?? regionMap[territoryName],
        };
    }).filter((a) => a);

    return [territoriesList, svgData];
};

const writeCleanSvg = async (territories, svgData) => {
    const svg = {
        svg: {
            width: '100%',
            height: '100%',
            viewBox: svgData.svg.viewBox,
            version: '1.1',
            'xmlns:xlink': 'http://www.w3.org/1999/xlink',
            xmlns: 'http://www.w3.org/2000/svg',
            image: {
                'xlink:href': svgData.svg.image['xlink:href'],
                width: svgData.svg.image.width,
                height: svgData.svg.image.height,
                id: 'baseMap',
                x: '2229',
                y: '258',
            },
            g: territories.map((territory) => {
                const tClasses = ['territory'];
                const rClasses = ['region'];

                const territoryPath = {
                    id: territory.territoryName,
                    class: tClasses.join(' '),
                    d: territory.path,
                };

                if (barbTerritories(territory.territoryName)) {
                    rClasses.push('barbarian');
                }

                return {
                    id: territory.id,
                    path: territoryPath,
                    g: {
                        id: territory.territoryName,
                        path: territory.regions.map((region) => {
                            return {
                                id: region.regionName,
                                class: rClasses.join(' '),
                                d: region.path,
                            };
                        }),
                    },
                };
            }),
        },
    };
    await fs.writeFile('./maps/Empire-complete.svg', xml2json.toXml(svg));
};

const generateTerritorySeeds = async (territories) => {
    const territorySeeds = `'use strict';

const {v5: uuid} = require('uuid');

// Base static data that the system should always have.

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
module.exports.seed = async (knex) => {

    // Territory Data
    await knex('territroy').del();
    await knex('territory').insert([
        ${territories.map((territory) => {
        const name = territory.territoryName.replace('\'', '\\\'');
        return `{
            id: uuid('TERRITORY/${name}', uuid.URL),
            name: '${name}',
            path: '${territory.path}',
        },`;
    }).join('\n        ')}
    ]);

    await knex('region').del();
    await knex('region').insert([
        ${territories.reduce((out, territory) => {
        const tname = territory.territoryName.replace('\'', '\\\'');
        territory.regions.forEach((region) => {
            const name = region.regionName.replace('\'', '\\\'');
            out.push(`{
            id: uuid('TERRITORY/${tname}/REGION/${name}', uuid.URL),
            name: '${name}',
            path: '${region.path}',
            territoryId: uuid('TERRITORY/${tname}', uuid.URL),
        },`);
        });
        return out;
    }, []).join('\n        ')}
    ]);
};
`;

    await fs.writeFile('./db/seeds/map_data.js', territorySeeds);
};

(async () => {
    const [territories, svgData] = await extractTerritoriesFromRawSvg();
    await Promise.all([
        writeCleanSvg(territories, svgData),
        generateTerritorySeeds(territories),
    ]);
})();
