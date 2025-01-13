const ss = {
    "visibleAttributes": [
        "nri_category",
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters",
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters"
    ],
    "pageSize": 5,
    "attributes": [
        {
            "desc": null,
            "name": "ogc_fid",
            "type": "integer",
            "display": ""
        },
        {
            "desc": null,
            "name": "geoid",
            "type": "string",
            "display": "geoid-variable"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "NCEI Storm Events Dataset Event ID",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "event_id",
            "type": "integer",
            "display": "meta-variable",
            "display_name": "Event ID (Numerical)"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "FEMA disaster number",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "disaster_number",
            "type": "string",
            "display": "meta-variable",
            "meta_lookup": "{\"view_id\": 827, \"keyAttribute\":\"disaster_number\", \"valueAttribute\": \"declaration_title\", \"keepId\": true, \"attributes\": [\"disaster_number\",\"declaration_title\"]}",
            "display_name": "Disaster Number"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Hazard name - Avalanche, Earthquake, etc.",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "nri_category",
            "type": "string",
            "display": "meta-variable",
            "defaultFn": "List",
            "meta_lookup": "{ \"coldwave\":\"Extreme Cold\", \"hail\":\"Hail\", \"avalanche\":\"Avalanche\", \"coastal\":\"Coastal Hazards\", \"drought\":\"Drought\", \"earthquake\":\"Earthquake\", \"heatwave\":\"Extreme Heat\", \"hurricane\":\"Hurricane\", \"icestorm\":\"Ice Storm\", \"landslide\":\"Landslide\", \"lightning\":\"Lightning\", \"riverine\":\"Flooding\", \"tornado\":\"Tornado\", \"tsunami\":\"Tsunami/Seiche\", \"volcano\":\"Volcano\", \"wildfire\":\"Wildfire\", \"wind\":\"Wind\", \"winterweat\":\"Snowstorm\" }",
            "display_name": "NRI Category"
        },
        {
            "desc": null,
            "name": "fema_incident_type",
            "type": "string",
            "display": "data-variable",
            "display_name": "Disaster Type"
        },
        {
            "desc": null,
            "name": "event_narrative",
            "type": "string",
            "display": "data-variable",
            "display_name": "Event Narrative"
        },
        {
            "desc": null,
            "name": "episode_narrative",
            "type": "string",
            "display": "meta-variable",
            "display_name": "Episode Narrative"
        },
        {
            "desc": null,
            "name": "lat",
            "type": "number",
            "display": "data-variable",
            "display_name": "Lattitude"
        },
        {
            "desc": null,
            "name": "lon",
            "type": "number",
            "display": "data-variable",
            "display_name": "Longitude"
        },
        {
            "desc": null,
            "name": "swd_begin_date",
            "type": "string",
            "display": "data-variable",
            "display_name": "SWD Begin Date"
        },
        {
            "desc": null,
            "name": "swd_end_date",
            "type": "string",
            "display": "data-variable"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "FEMA disaster start date",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "fema_incident_begin_date",
            "type": "string",
            "display": "data-variable",
            "display_name": "Disaster Start Date"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "FEMA disaster end date",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "fema_incident_end_date",
            "type": "string",
            "display": "data-variable",
            "display_name": "Disaster End Date"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Count of Deaths/Injuries",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "swd_population_damage",
            "type": "number",
            "display": "data-variable",
            "display_name": "NCEI Severe Weather Population Damage"
        },
        {
            "desc": null,
            "name": "swd_population_damage_value",
            "type": "number",
            "display": "data-variable",
            "isDollar": true,
            "display_name": "NCEI Severe Weather Population Damage $"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Deaths that occurred as a direct result of disasters, ie. flooding, snow accumulation, etc.",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "deaths_direct",
            "type": "number",
            "display": "data-variable",
            "display_name": "Direct Death Count"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Deaths that occurred as an indirect result of disasters, ie. power outages, vehicle accidents due to ice, etc.",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "deaths_indirect",
            "type": "number",
            "display": "data-variable",
            "display_name": "Indirect Death Count"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Injuries that occurred as a direct result of disasters, ie. flooding, snow accumulation, etc.",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "injuries_direct",
            "type": "number",
            "display": "data-variable",
            "display_name": "Direct Injury Count"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Injuries that occurred as an indirect result of disasters, ie. power outages, vehicle accidents due to ice, etc.",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "injuries_indirect",
            "type": "number",
            "display": "data-variable",
            "display_name": "Indirect Injury Count"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Total property damages in dollars according to the combined and synthesized date from FEMA and NCEI",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "fusion_property_damage",
            "type": "number",
            "display": "data-variable",
            "isDollar": true,
            "defaultFn": "Sum",
            "display_name": "Fusion Property Damage"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Total crop damages in dollars according to the combined and synthesized date from FEMA and NCEI",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "fusion_crop_damage",
            "type": "number",
            "display": "data-variable",
            "isDollar": true,
            "defaultFn": "Sum",
            "display_name": "Fusion Crop Damage"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Total damage in dollars to both property and crops from the combined and synthesized data of FEMA and NCEI",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "fusion_total_damage",
            "type": "number",
            "display": "data-variable",
            "isDollar": true,
            "defaultFn": "Sum",
            "display_name": "Total Fusion Damage"
        },
        {
            "desc": null,
            "name": "wkb_geometry",
            "type": "object",
            "display": ""
        },
        {
            "name": "swd_population_damage * 11600000 as swd_population_damage_dollars",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "isDollar": true,
            "defaultFn": "Sum",
            "display_name": "Population Damage in Dollars"
        },
        {
            "name": "EXTRACT(MONTH from swd_begin_date) as month",
            "type": "string",
            "origin": "calculated-column",
            "display": "meta-variable",
            "defaultFn": "List",
            "meta_lookup": "{ \"1\":\"Jan\", \"2\":\"Feb\", \"3\":\"Mar\", \"4\":\"April\", \"5\":\"May\", \"6\":\"Jun\", \"7\":\"Jul\", \"8\":\"Aug\", \"9\":\"Sep\", \"10\":\"Oct\", \"11\":\"Nov\", \"12\":\"Dec\"}",
            "display_name": "Month of Event"
        },
        {
            "name": "(disaster_number) AS disaster_number_only",
            "type": "number",
            "origin": "calculated-column",
            "display": "meta-variable",
            "display_name": "Disaster Number (# Only)"
        },
        {
            "name": "substring(geoid, 1, 2) as state_geoid",
            "origin": "calculated-column",
            "display": "meta-variable",
            "display_name": "State GEOID"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Total number of direct and indirect injuries",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "COALESCE(injuries_direct, 0) + COALESCE(injuries_indirect, 0) as injuries_total",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "display_name": "Injuries"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Total number of direct and indirect deaths",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "COALESCE(deaths_direct, 0) + COALESCE(deaths_indirect, 0) as deaths_total",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "display_name": "Deaths"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Year event occurred according to FEMA declaration",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "EXTRACT(YEAR from fema_incident_begin_date) as year",
            "type": "string",
            "origin": "calculated-column",
            "display": "meta-variable",
            "display_name": "Year of Declared Disaster"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Year disaster occurred",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "EXTRACT(YEAR from swd_begin_date) as year_of_event",
            "type": "string",
            "origin": "calculated-column",
            "display": "meta-variable",
            "display_name": "Year of Event"
        },
        {
            "name": "coalesce(fema_incident_type, nri_category) as fusion_category",
            "type": "string",
            "origin": "calculated-column",
            "display": "meta-variable",
            "defaultFn": "List",
            "meta_lookup": "{ \"coldwave\":\"Extreme Cold\", \"hail\":\"Hail\", \"avalanche\":\"Avalanche\", \"coastal\":\"Coastal Hazards\", \"drought\":\"Drought\", \"earthquake\":\"Earthquake\", \"heatwave\":\"Extreme Heat\", \"hurricane\":\"Hurricane\", \"icestorm\":\"Ice Storm\", \"landslide\":\"Landslide\", \"lightning\":\"Lightning\", \"riverine\":\"Flooding\", \"tornado\":\"Tornado\", \"tsunami\":\"Tsunami/Seiche\", \"volcano\":\"Volcano\", \"wildfire\":\"Wildfire\", \"wind\":\"Wind\", \"winterweat\":\"Snowstorm\" }",
            "display_name": "Disaster Category"
        },
        {
            "name": "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "isDollar": true,
            "defaultFn": "Sum",
            "display_name": "$ of Declared Disasters"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Total Fusion Damage of Disasters recorded but not identified as a declared disaster by FEMA",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "CASE WHEN disaster_number = 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_non_declared_disasters",
            "origin": "calculated-column",
            "display": "data-variable",
            "display_name": "$ of Non-Declared Disasters"
        },
        {
            "name": "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "defaultFn": "Count",
            "display_name": "# of Declared Disasters"
        },
        {
            "name": "distinct CASE WHEN disaster_number != 'Non-Declared' AND fusion_total_damage > 0 THEN disaster_number WHEN disaster_number = 'Non-Declared' THEN event_id::text END as num_events",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "defaultFn": "Count",
            "display_name": "# of Events"
        },
        {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Total Number of Disasters recorded but not identified as a declared disaster by FEMA",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "distinct CASE WHEN disaster_number = 'Non-Declared' THEN event_id ELSE null END as num_non_declared_disasters",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "defaultFn": "Count",
            "display_name": "# of Non-Declared Disasters"
        },
        {
            "name": "substring(geoid,1,5) AS county",
            "type": "string",
            "origin": "calculated-column",
            "display": "meta-variable",
            "defaultFn": "List",
            "meta_lookup": "{\"view_id\": 750, \"filter\": {\"year\": [2020], \"length(geoid)\": [5]}, \"geoAttribute\": \"geoid\", \"keyAttribute\":\"geoid\",\"valueAttribute\":\"formatted_name\",\"attributes\": [\"geoid\",\"formatted_name\"]}",
            "display_name": "County"
        },
        {
            "name": "substring(geoid, 1, 2) as state",
            "type": "string",
            "origin": "calculated-column",
            "display": "meta-variable",
            "defaultFn": "List",
            "meta_lookup": "{\"view_id\": 750, \"filter\": {\"year\": [2020], \"length(geoid)\": [2]}, \"geoAttribute\": \"geoid\", \"keyAttribute\":\"geoid\",\"attributes\": [\"geoid\",\"name\"]}",
            "display_name": "State"
        },
        {
            "name": "EXTRACT(YEAR from coalesce(swd_begin_date, fema_incident_begin_date)) as fusion_year",
            "type": "integer",
            "origin": "calculated-column",
            "display": "meta-variable",
            "display_name": "Fusion Year"
        },
        {
            "name": "case when disaster_number = 'Non-Declared' then 'Non-Declared' else 'Declared' end as fusion_disaster_category",
            "origin": "calculated-column",
            "display": "meta-variable",
            "display_name": "Fusion Disaster Category"
        },
        {
            "name": "EXTRACT(MONTH from coalesce(swd_begin_date, fema_incident_begin_date)) as fusion_month",
            "type": "string",
            "origin": "calculated-column",
            "display": "meta-variable",
            "meta_lookup": "{ \"1\":\"Jan\", \"2\":\"Feb\", \"3\":\"Mar\", \"4\":\"April\", \"5\":\"May\", \"6\":\"Jun\", \"7\":\"Jul\", \"8\":\"Aug\", \"9\":\"Sep\", \"10\":\"Oct\", \"11\":\"Nov\", \"12\":\"Dec\"}",
            "display_name": "Fusion Month"
        },
        {
            "name": "COALESCE(fusion_property_damage, 0) + COALESCE(fusion_crop_damage, 0) + COALESCE(swd_population_damage_value, 0) as fusion_total_damage_with_pop",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "isDollar": true,
            "defaultFn": "Sum",
            "display_name": "Total Fusion Damage (with Population)"
        }
    ],
    "customColNames": {},
    "orderBy": {
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": "desc nulls last"
    },
    "colSizes": {
        "nri_category": 245.66666666666666,
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": 245.66666666666666,
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": 245.66666666666666
    },
    "filters": [
        {
            "column": "nri_category",
            "values": [
                {
                    "label": "Hurricane",
                    "value": "hurricane"
                },
                {
                    "label": "Coastal Hazards",
                    "value": "coastal"
                },
                {
                    "label": "Extreme Cold",
                    "value": "coldwave"
                }
            ],
            "valueSets": []
        }
    ],
    "groupBy": [
        "nri_category"
    ],
    "fn": {
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": "sum",
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": "count"
    },
    "notNull": [],
    "format": {
        "name": "AVAIL - Fusion Events V2",
        "metadata": {
            "columns": [
                {
                    "desc": null,
                    "name": "ogc_fid",
                    "type": "integer",
                    "display": ""
                },
                {
                    "desc": null,
                    "name": "geoid",
                    "type": "string",
                    "display": "geoid-variable"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "NCEI Storm Events Dataset Event ID",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "event_id",
                    "type": "integer",
                    "display": "meta-variable",
                    "display_name": "Event ID (Numerical)"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "FEMA disaster number",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "disaster_number",
                    "type": "string",
                    "display": "meta-variable",
                    "meta_lookup": "{\"view_id\": 827, \"keyAttribute\":\"disaster_number\", \"valueAttribute\": \"declaration_title\", \"keepId\": true, \"attributes\": [\"disaster_number\",\"declaration_title\"]}",
                    "display_name": "Disaster Number"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Hazard name - Avalanche, Earthquake, etc.",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "nri_category",
                    "type": "string",
                    "display": "meta-variable",
                    "defaultFn": "List",
                    "meta_lookup": "{ \"coldwave\":\"Extreme Cold\", \"hail\":\"Hail\", \"avalanche\":\"Avalanche\", \"coastal\":\"Coastal Hazards\", \"drought\":\"Drought\", \"earthquake\":\"Earthquake\", \"heatwave\":\"Extreme Heat\", \"hurricane\":\"Hurricane\", \"icestorm\":\"Ice Storm\", \"landslide\":\"Landslide\", \"lightning\":\"Lightning\", \"riverine\":\"Flooding\", \"tornado\":\"Tornado\", \"tsunami\":\"Tsunami/Seiche\", \"volcano\":\"Volcano\", \"wildfire\":\"Wildfire\", \"wind\":\"Wind\", \"winterweat\":\"Snowstorm\" }",
                    "display_name": "NRI Category"
                },
                {
                    "desc": null,
                    "name": "fema_incident_type",
                    "type": "string",
                    "display": "data-variable",
                    "display_name": "Disaster Type"
                },
                {
                    "desc": null,
                    "name": "event_narrative",
                    "type": "string",
                    "display": "data-variable",
                    "display_name": "Event Narrative"
                },
                {
                    "desc": null,
                    "name": "episode_narrative",
                    "type": "string",
                    "display": "meta-variable",
                    "display_name": "Episode Narrative"
                },
                {
                    "desc": null,
                    "name": "lat",
                    "type": "number",
                    "display": "data-variable",
                    "display_name": "Lattitude"
                },
                {
                    "desc": null,
                    "name": "lon",
                    "type": "number",
                    "display": "data-variable",
                    "display_name": "Longitude"
                },
                {
                    "desc": null,
                    "name": "swd_begin_date",
                    "type": "string",
                    "display": "data-variable",
                    "display_name": "SWD Begin Date"
                },
                {
                    "desc": null,
                    "name": "swd_end_date",
                    "type": "string",
                    "display": "data-variable"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "FEMA disaster start date",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "fema_incident_begin_date",
                    "type": "string",
                    "display": "data-variable",
                    "display_name": "Disaster Start Date"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "FEMA disaster end date",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "fema_incident_end_date",
                    "type": "string",
                    "display": "data-variable",
                    "display_name": "Disaster End Date"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Count of Deaths/Injuries",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "swd_population_damage",
                    "type": "number",
                    "display": "data-variable",
                    "display_name": "NCEI Severe Weather Population Damage"
                },
                {
                    "desc": null,
                    "name": "swd_population_damage_value",
                    "type": "number",
                    "display": "data-variable",
                    "isDollar": true,
                    "display_name": "NCEI Severe Weather Population Damage $"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Deaths that occurred as a direct result of disasters, ie. flooding, snow accumulation, etc.",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "deaths_direct",
                    "type": "number",
                    "display": "data-variable",
                    "display_name": "Direct Death Count"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Deaths that occurred as an indirect result of disasters, ie. power outages, vehicle accidents due to ice, etc.",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "deaths_indirect",
                    "type": "number",
                    "display": "data-variable",
                    "display_name": "Indirect Death Count"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Injuries that occurred as a direct result of disasters, ie. flooding, snow accumulation, etc.",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "injuries_direct",
                    "type": "number",
                    "display": "data-variable",
                    "display_name": "Direct Injury Count"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Injuries that occurred as an indirect result of disasters, ie. power outages, vehicle accidents due to ice, etc.",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "injuries_indirect",
                    "type": "number",
                    "display": "data-variable",
                    "display_name": "Indirect Injury Count"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Total property damages in dollars according to the combined and synthesized date from FEMA and NCEI",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "fusion_property_damage",
                    "type": "number",
                    "display": "data-variable",
                    "isDollar": true,
                    "defaultFn": "Sum",
                    "display_name": "Fusion Property Damage"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Total crop damages in dollars according to the combined and synthesized date from FEMA and NCEI",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "fusion_crop_damage",
                    "type": "number",
                    "display": "data-variable",
                    "isDollar": true,
                    "defaultFn": "Sum",
                    "display_name": "Fusion Crop Damage"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Total damage in dollars to both property and crops from the combined and synthesized data of FEMA and NCEI",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "fusion_total_damage",
                    "type": "number",
                    "display": "data-variable",
                    "isDollar": true,
                    "defaultFn": "Sum",
                    "display_name": "Total Fusion Damage"
                },
                {
                    "desc": null,
                    "name": "wkb_geometry",
                    "type": "object",
                    "display": ""
                },
                {
                    "name": "swd_population_damage * 11600000 as swd_population_damage_dollars",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "isDollar": true,
                    "defaultFn": "Sum",
                    "display_name": "Population Damage in Dollars"
                },
                {
                    "name": "EXTRACT(MONTH from swd_begin_date) as month",
                    "type": "string",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "defaultFn": "List",
                    "meta_lookup": "{ \"1\":\"Jan\", \"2\":\"Feb\", \"3\":\"Mar\", \"4\":\"April\", \"5\":\"May\", \"6\":\"Jun\", \"7\":\"Jul\", \"8\":\"Aug\", \"9\":\"Sep\", \"10\":\"Oct\", \"11\":\"Nov\", \"12\":\"Dec\"}",
                    "display_name": "Month of Event"
                },
                {
                    "name": "(disaster_number) AS disaster_number_only",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "display_name": "Disaster Number (# Only)"
                },
                {
                    "name": "substring(geoid, 1, 2) as state_geoid",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "display_name": "State GEOID"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Total number of direct and indirect injuries",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "COALESCE(injuries_direct, 0) + COALESCE(injuries_indirect, 0) as injuries_total",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "display_name": "Injuries"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Total number of direct and indirect deaths",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "COALESCE(deaths_direct, 0) + COALESCE(deaths_indirect, 0) as deaths_total",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "display_name": "Deaths"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Year event occurred according to FEMA declaration",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "EXTRACT(YEAR from fema_incident_begin_date) as year",
                    "type": "string",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "display_name": "Year of Declared Disaster"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Year disaster occurred",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "EXTRACT(YEAR from swd_begin_date) as year_of_event",
                    "type": "string",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "display_name": "Year of Event"
                },
                {
                    "name": "coalesce(fema_incident_type, nri_category) as fusion_category",
                    "type": "string",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "defaultFn": "List",
                    "meta_lookup": "{ \"coldwave\":\"Extreme Cold\", \"hail\":\"Hail\", \"avalanche\":\"Avalanche\", \"coastal\":\"Coastal Hazards\", \"drought\":\"Drought\", \"earthquake\":\"Earthquake\", \"heatwave\":\"Extreme Heat\", \"hurricane\":\"Hurricane\", \"icestorm\":\"Ice Storm\", \"landslide\":\"Landslide\", \"lightning\":\"Lightning\", \"riverine\":\"Flooding\", \"tornado\":\"Tornado\", \"tsunami\":\"Tsunami/Seiche\", \"volcano\":\"Volcano\", \"wildfire\":\"Wildfire\", \"wind\":\"Wind\", \"winterweat\":\"Snowstorm\" }",
                    "display_name": "Disaster Category"
                },
                {
                    "name": "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "isDollar": true,
                    "defaultFn": "Sum",
                    "display_name": "$ of Declared Disasters"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Total Fusion Damage of Disasters recorded but not identified as a declared disaster by FEMA",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "CASE WHEN disaster_number = 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_non_declared_disasters",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "display_name": "$ of Non-Declared Disasters"
                },
                {
                    "name": "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "defaultFn": "Count",
                    "display_name": "# of Declared Disasters"
                },
                {
                    "name": "distinct CASE WHEN disaster_number != 'Non-Declared' AND fusion_total_damage > 0 THEN disaster_number WHEN disaster_number = 'Non-Declared' THEN event_id::text END as num_events",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "defaultFn": "Count",
                    "display_name": "# of Events"
                },
                {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Total Number of Disasters recorded but not identified as a declared disaster by FEMA",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "distinct CASE WHEN disaster_number = 'Non-Declared' THEN event_id ELSE null END as num_non_declared_disasters",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "defaultFn": "Count",
                    "display_name": "# of Non-Declared Disasters"
                },
                {
                    "name": "substring(geoid,1,5) AS county",
                    "type": "string",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "defaultFn": "List",
                    "meta_lookup": "{\"view_id\": 750, \"filter\": {\"year\": [2020], \"length(geoid)\": [5]}, \"geoAttribute\": \"geoid\", \"keyAttribute\":\"geoid\",\"valueAttribute\":\"formatted_name\",\"attributes\": [\"geoid\",\"formatted_name\"]}",
                    "display_name": "County"
                },
                {
                    "name": "substring(geoid, 1, 2) as state",
                    "type": "string",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "defaultFn": "List",
                    "meta_lookup": "{\"view_id\": 750, \"filter\": {\"year\": [2020], \"length(geoid)\": [2]}, \"geoAttribute\": \"geoid\", \"keyAttribute\":\"geoid\",\"attributes\": [\"geoid\",\"name\"]}",
                    "display_name": "State"
                },
                {
                    "name": "EXTRACT(YEAR from coalesce(swd_begin_date, fema_incident_begin_date)) as fusion_year",
                    "type": "integer",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "display_name": "Fusion Year"
                },
                {
                    "name": "case when disaster_number = 'Non-Declared' then 'Non-Declared' else 'Declared' end as fusion_disaster_category",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "display_name": "Fusion Disaster Category"
                },
                {
                    "name": "EXTRACT(MONTH from coalesce(swd_begin_date, fema_incident_begin_date)) as fusion_month",
                    "type": "string",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "meta_lookup": "{ \"1\":\"Jan\", \"2\":\"Feb\", \"3\":\"Mar\", \"4\":\"April\", \"5\":\"May\", \"6\":\"Jun\", \"7\":\"Jul\", \"8\":\"Aug\", \"9\":\"Sep\", \"10\":\"Oct\", \"11\":\"Nov\", \"12\":\"Dec\"}",
                    "display_name": "Fusion Month"
                },
                {
                    "name": "COALESCE(fusion_property_damage, 0) + COALESCE(fusion_crop_damage, 0) + COALESCE(swd_population_damage_value, 0) as fusion_total_damage_with_pop",
                    "type": "number",
                    "origin": "calculated-column",
                    "display": "data-variable",
                    "isDollar": true,
                    "defaultFn": "Sum",
                    "display_name": "Total Fusion Damage (with Population)"
                }
            ]
        },
        "id": 870,
        "env": "hazmit_dama",
        "srcEnv": "hazmit_dama",
        "view_id": 1648
    },
    "view": {
        "id": 1648,
        "version": "AVAIL - Fusion Events V2 (12/10/2024)",
        "_modified_timestamp": "2024-12-16T23:27:24.203Z"
    },
    "actions": [],
    "allowSearchParams": false,
    "loadMoreId": "id0e7fd6bf-55d5-45ef-84ba-d262de1a5d40",
    "striped": true,
    "showTotal": false,
    "usePagination": true,
    "colJustify": {
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": "right",
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": "right"
    },
    "formatFn": {},
    "fontSize": {},
    "linkCols": {
        "nri_category": {},
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": {},
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": {}
    },
    "openOutCols": [],
    "hideHeader": [],
    "cardSpan": {},
    "data": [
        {
            "nri_category": "Hurricane",
            "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": 374525145706.24335,
            "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": 1157
        },
        {
            "nri_category": "Coastal Hazards",
            "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": 3417543584.240001,
            "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": 65
        },
        {
            "nri_category": "Extreme Cold",
            "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": 2784794989.52,
            "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": 13
        }
    ],
    "attributionData": {
        "source_id": 870,
        "view_id": 1648,
        "version": "AVAIL - Fusion Events V2 (12/10/2024)"
    }
}

const cenrep = {
    "data": [
        {
            "nri_category": "Hurricane",
            "sum(CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END) as amt_declared_disasters": 374525145706.2433,
            "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters": "1157"
        },
        {
            "nri_category": "Coastal Hazards",
            "sum(CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END) as amt_declared_disasters": 3417543584.2400007,
            "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters": "65"
        },
        {
            "nri_category": "Extreme Cold",
            "sum(CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END) as amt_declared_disasters": 2784794989.52,
            "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters": "13"
        },
        {
            "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters": 1235,
            "nri_category": "Total",
            "totalRow": true
        }
    ],
    "columns": [
        {
            "Header": "NRI Category",
            "accessor": "nri_category",
            "align": "left",
            "width": "15%",
            "minWidth": "15%",
            "maxWidth": "15%",
            "extFilter": false,
            "info": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Hazard name - Avalanche, Earthquake, etc.",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "openOut": false,
            "link": {},
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Hazard name - Avalanche, Earthquake, etc.",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "nri_category",
            "type": "string",
            "display": "meta-variable",
            "defaultFn": "List",
            "meta_lookup": "{ \"coldwave\":\"Extreme Cold\", \"hail\":\"Hail\", \"avalanche\":\"Avalanche\", \"coastal\":\"Coastal Hazards\", \"drought\":\"Drought\", \"earthquake\":\"Earthquake\", \"heatwave\":\"Extreme Heat\", \"hurricane\":\"Hurricane\", \"icestorm\":\"Ice Storm\", \"landslide\":\"Landslide\", \"lightning\":\"Lightning\", \"riverine\":\"Flooding\", \"tornado\":\"Tornado\", \"tsunami\":\"Tsunami/Seiche\", \"volcano\":\"Volcano\", \"wildfire\":\"Wildfire\", \"wind\":\"Wind\", \"winterweat\":\"Snowstorm\" }",
            "display_name": "NRI Category"
        },
        {
            "Header": "$ of Declared Disasters",
            "accessor": "sum(CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END) as amt_declared_disasters",
            "align": "right",
            "width": "15%",
            "minWidth": "15%",
            "maxWidth": "15%",
            "extFilter": false,
            "openOut": false,
            "link": {},
            "name": "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "isDollar": true,
            "defaultFn": "Sum",
            "display_name": "$ of Declared Disasters"
        },
        {
            "Header": "# of Declared Disasters",
            "accessor": "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters",
            "align": "right",
            "width": "15%",
            "minWidth": "15%",
            "maxWidth": "15%",
            "extFilter": true,
            "openOut": false,
            "link": {},
            "name": "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters",
            "type": "number",
            "origin": "calculated-column",
            "display": "data-variable",
            "defaultFn": "Count",
            "display_name": "# of Declared Disasters"
        }
    ],
    "attributionData": {
        "view_id": 1648,
        "source_id": 870,
        "data_type": {
            "$type": "atom",
            "value": null
        },
        "interval_version": {
            "$type": "atom",
            "value": null
        },
        "geography_version": {
            "$type": "atom",
            "value": null
        },
        "version": "AVAIL - Fusion Events V2 (12/10/2024)",
        "source_url": {
            "$type": "atom",
            "value": null
        },
        "publisher": {
            "$type": "atom",
            "value": null
        },
        "table_schema": "open_fema_data",
        "table_name": "fusion_1648",
        "data_table": "open_fema_data.fusion_1648",
        "download_url": {
            "$type": "atom",
            "value": null
        },
        "tiles_url": {
            "$type": "atom",
            "value": null
        },
        "start_date": {
            "$type": "atom",
            "value": null
        },
        "end_date": {
            "$type": "atom",
            "value": null
        },
        "last_updated": {
            "$type": "atom",
            "value": null
        },
        "statistics": {
            "$type": "atom",
            "value": null
        },
        "metadata": {
            "$type": "atom",
            "value": {
                "tiles": {
                    "layers": [
                        {
                            "id": "s870_v1648_tPoint",
                            "type": "circle",
                            "paint": {
                                "circle-color": "#B42222",
                                "circle-radius": 4
                            },
                            "source": "fusion",
                            "source-layer": "view_1648"
                        }
                    ],
                    "sources": [
                        {
                            "id": "fusion",
                            "source": {
                                "type": "vector",
                                "tiles": [
                                    "https://graph.availabs.org/dama-admin/hazmit_dama/tiles/1648/{z}/{x}/{y}/t.pbf"
                                ],
                                "format": "pbf"
                            }
                        }
                    ]
                },
                "download": {
                    "CSV": "$HOST/files/hazmit_dama_1648/AVAIL - Fusion Events V2_1648_AVAIL - Fusion Events V2 (12/10/2024).csv.zip",
                    "GPKG": "$HOST/files/hazmit_dama_1648/AVAIL - Fusion Events V2_1648_AVAIL - Fusion Events V2 (12/10/2024).gpkg.zip",
                    "GeoJSON": "$HOST/files/hazmit_dama_1648/AVAIL - Fusion Events V2_1648_AVAIL - Fusion Events V2 (12/10/2024).geojson.zip",
                    "ESRI Shapefile": "$HOST/files/hazmit_dama_1648/AVAIL - Fusion Events V2_1648_AVAIL - Fusion Events V2 (12/10/2024).zip"
                }
            }
        },
        "user_id": 1,
        "etl_context_id": 6404,
        "view_dependencies": {
            "$type": "atom",
            "value": [
                1647,
                1157,
                286
            ]
        },
        "active_start_timestamp": {
            "$type": "atom",
            "value": null
        },
        "active_end_timestamp": {
            "$type": "atom",
            "value": null
        },
        "_created_timestamp": {
            "$type": "atom",
            "value": "2024-12-10T22:29:44.419Z"
        },
        "_modified_timestamp": {
            "$type": "atom",
            "value": "2024-12-16T23:27:24.203Z"
        }
    },
    "geoAttribute": "geoid",
    "pageSize": 5,
    "dataSize": 100,
    "sortBy": {
        "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters": "desc"
    },
    "groupBy": [
        "nri_category"
    ],
    "fn": {
        "nri_category": "nri_category",
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": "sum(CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END) as amt_declared_disasters",
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters"
    },
    "notNull": [],
    "showTotal": [
        "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters"
    ],
    "colSizes": {},
    "filters": {},
    "filterValue": {},
    "formatFn": {},
    "visibleCols": [
        "nri_category",
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters",
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters"
    ],
    "hiddenCols": [],
    "dataSource": 870,
    "dataSources": [], // unideally saving all datasources.
    "version": 1648,
    "extFilterCols": [
        "count(distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END) as num_declared_disasters"
    ],
    "extFilterValues": {},
    "colJustify": {},
    "striped": true,
    "extFiltersDefaultOpen": true,
    "customColName": {
        "nri_category": "NRI Category",
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": "$ of Declared Disasters",
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": "# of Declared Disasters"
    },
    "linkCols": {
        "nri_category": {},
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": {},
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": {}
    },
    "openOutCols": [],
    "showCsvDownload": true,
    "additionalVariables": [
        {
            "name": "nri_category",
            "type": "simple",
            "action": "include",
            "defaultValue": "coastal",
            "displayName": "NRI Category"
        },
        {
            "name": "nri_category",
            "type": "simple",
            "action": "include",
            "defaultValue": "coldwave",
            "displayName": "NRI Category"
        },
        {
            "name": "nri_category",
            "type": "simple",
            "action": "include",
            "defaultValue": "hurricane",
            "displayName": "NRI Category"
        }
    ]
}

const graph = {
    viewData: ['copy of full data fetched using state while saving'],
    state: {
        "activeSource": {
            "source_id": 870,
            "name": "AVAIL - Fusion Events V2",
            "metadata": {
                "$type": "atom",
                "value": {
                    "columns": [
                        {
                            "desc": null,
                            "name": "ogc_fid",
                            "type": "integer",
                            "display": ""
                        },
                        {
                            "desc": null,
                            "name": "geoid",
                            "type": "string",
                            "display": "geoid-variable"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "NCEI Storm Events Dataset Event ID",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "event_id",
                            "type": "integer",
                            "display": "meta-variable",
                            "display_name": "Event ID (Numerical)"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "FEMA disaster number",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "disaster_number",
                            "type": "string",
                            "display": "meta-variable",
                            "meta_lookup": "{\"view_id\": 827, \"keyAttribute\":\"disaster_number\", \"valueAttribute\": \"declaration_title\", \"keepId\": true, \"attributes\": [\"disaster_number\",\"declaration_title\"]}",
                            "display_name": "Disaster Number"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Hazard name - Avalanche, Earthquake, etc.",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "nri_category",
                            "type": "string",
                            "display": "meta-variable",
                            "defaultFn": "List",
                            "meta_lookup": "{ \"coldwave\":\"Extreme Cold\", \"hail\":\"Hail\", \"avalanche\":\"Avalanche\", \"coastal\":\"Coastal Hazards\", \"drought\":\"Drought\", \"earthquake\":\"Earthquake\", \"heatwave\":\"Extreme Heat\", \"hurricane\":\"Hurricane\", \"icestorm\":\"Ice Storm\", \"landslide\":\"Landslide\", \"lightning\":\"Lightning\", \"riverine\":\"Flooding\", \"tornado\":\"Tornado\", \"tsunami\":\"Tsunami/Seiche\", \"volcano\":\"Volcano\", \"wildfire\":\"Wildfire\", \"wind\":\"Wind\", \"winterweat\":\"Snowstorm\" }",
                            "display_name": "NRI Category"
                        },
                        {
                            "desc": null,
                            "name": "fema_incident_type",
                            "type": "string",
                            "display": "data-variable",
                            "display_name": "Disaster Type"
                        },
                        {
                            "desc": null,
                            "name": "event_narrative",
                            "type": "string",
                            "display": "data-variable",
                            "display_name": "Event Narrative"
                        },
                        {
                            "desc": null,
                            "name": "episode_narrative",
                            "type": "string",
                            "display": "meta-variable",
                            "display_name": "Episode Narrative"
                        },
                        {
                            "desc": null,
                            "name": "lat",
                            "type": "number",
                            "display": "data-variable",
                            "display_name": "Lattitude"
                        },
                        {
                            "desc": null,
                            "name": "lon",
                            "type": "number",
                            "display": "data-variable",
                            "display_name": "Longitude"
                        },
                        {
                            "desc": null,
                            "name": "swd_begin_date",
                            "type": "string",
                            "display": "data-variable",
                            "display_name": "SWD Begin Date"
                        },
                        {
                            "desc": null,
                            "name": "swd_end_date",
                            "type": "string",
                            "display": "data-variable"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "FEMA disaster start date",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "fema_incident_begin_date",
                            "type": "string",
                            "display": "data-variable",
                            "display_name": "Disaster Start Date"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "FEMA disaster end date",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "fema_incident_end_date",
                            "type": "string",
                            "display": "data-variable",
                            "display_name": "Disaster End Date"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Count of Deaths/Injuries",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "swd_population_damage",
                            "type": "number",
                            "display": "data-variable",
                            "display_name": "NCEI Severe Weather Population Damage"
                        },
                        {
                            "desc": null,
                            "name": "swd_population_damage_value",
                            "type": "number",
                            "display": "data-variable",
                            "isDollar": true,
                            "display_name": "NCEI Severe Weather Population Damage $"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Deaths that occurred as a direct result of disasters, ie. flooding, snow accumulation, etc.",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "deaths_direct",
                            "type": "number",
                            "display": "data-variable",
                            "display_name": "Direct Death Count"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Deaths that occurred as an indirect result of disasters, ie. power outages, vehicle accidents due to ice, etc.",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "deaths_indirect",
                            "type": "number",
                            "display": "data-variable",
                            "display_name": "Indirect Death Count"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Injuries that occurred as a direct result of disasters, ie. flooding, snow accumulation, etc.",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "injuries_direct",
                            "type": "number",
                            "display": "data-variable",
                            "display_name": "Direct Injury Count"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Injuries that occurred as an indirect result of disasters, ie. power outages, vehicle accidents due to ice, etc.",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "injuries_indirect",
                            "type": "number",
                            "display": "data-variable",
                            "display_name": "Indirect Injury Count"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Total property damages in dollars according to the combined and synthesized date from FEMA and NCEI",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "fusion_property_damage",
                            "type": "number",
                            "display": "data-variable",
                            "isDollar": true,
                            "defaultFn": "Sum",
                            "display_name": "Fusion Property Damage"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Total crop damages in dollars according to the combined and synthesized date from FEMA and NCEI",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "fusion_crop_damage",
                            "type": "number",
                            "display": "data-variable",
                            "isDollar": true,
                            "defaultFn": "Sum",
                            "display_name": "Fusion Crop Damage"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Total damage in dollars to both property and crops from the combined and synthesized data of FEMA and NCEI",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "fusion_total_damage",
                            "type": "number",
                            "display": "data-variable",
                            "isDollar": true,
                            "defaultFn": "Sum",
                            "display_name": "Total Fusion Damage"
                        },
                        {
                            "desc": null,
                            "name": "wkb_geometry",
                            "type": "object",
                            "display": ""
                        },
                        {
                            "name": "swd_population_damage * 11600000 as swd_population_damage_dollars",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "isDollar": true,
                            "defaultFn": "Sum",
                            "display_name": "Population Damage in Dollars"
                        },
                        {
                            "name": "EXTRACT(MONTH from swd_begin_date) as month",
                            "type": "string",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "defaultFn": "List",
                            "meta_lookup": "{ \"1\":\"Jan\", \"2\":\"Feb\", \"3\":\"Mar\", \"4\":\"April\", \"5\":\"May\", \"6\":\"Jun\", \"7\":\"Jul\", \"8\":\"Aug\", \"9\":\"Sep\", \"10\":\"Oct\", \"11\":\"Nov\", \"12\":\"Dec\"}",
                            "display_name": "Month of Event"
                        },
                        {
                            "name": "(disaster_number) AS disaster_number_only",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "display_name": "Disaster Number (# Only)"
                        },
                        {
                            "name": "substring(geoid, 1, 2) as state_geoid",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "display_name": "State GEOID"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Total number of direct and indirect injuries",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "COALESCE(injuries_direct, 0) + COALESCE(injuries_indirect, 0) as injuries_total",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "display_name": "Injuries"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Total number of direct and indirect deaths",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "COALESCE(deaths_direct, 0) + COALESCE(deaths_indirect, 0) as deaths_total",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "display_name": "Deaths"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Year event occurred according to FEMA declaration",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "EXTRACT(YEAR from fema_incident_begin_date) as year",
                            "type": "string",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "display_name": "Year of Declared Disaster"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Year disaster occurred",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "EXTRACT(YEAR from swd_begin_date) as year_of_event",
                            "type": "string",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "display_name": "Year of Event"
                        },
                        {
                            "name": "coalesce(fema_incident_type, nri_category) as fusion_category",
                            "type": "string",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "defaultFn": "List",
                            "meta_lookup": "{ \"coldwave\":\"Extreme Cold\", \"hail\":\"Hail\", \"avalanche\":\"Avalanche\", \"coastal\":\"Coastal Hazards\", \"drought\":\"Drought\", \"earthquake\":\"Earthquake\", \"heatwave\":\"Extreme Heat\", \"hurricane\":\"Hurricane\", \"icestorm\":\"Ice Storm\", \"landslide\":\"Landslide\", \"lightning\":\"Lightning\", \"riverine\":\"Flooding\", \"tornado\":\"Tornado\", \"tsunami\":\"Tsunami/Seiche\", \"volcano\":\"Volcano\", \"wildfire\":\"Wildfire\", \"wind\":\"Wind\", \"winterweat\":\"Snowstorm\" }",
                            "display_name": "Disaster Category"
                        },
                        {
                            "name": "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "isDollar": true,
                            "defaultFn": "Sum",
                            "display_name": "$ of Declared Disasters"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Total Fusion Damage of Disasters recorded but not identified as a declared disaster by FEMA",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "CASE WHEN disaster_number = 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_non_declared_disasters",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "display_name": "$ of Non-Declared Disasters"
                        },
                        {
                            "name": "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "defaultFn": "Count",
                            "display_name": "# of Declared Disasters"
                        },
                        {
                            "name": "distinct CASE WHEN disaster_number != 'Non-Declared' AND fusion_total_damage > 0 THEN disaster_number WHEN disaster_number = 'Non-Declared' THEN event_id::text END as num_events",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "defaultFn": "Count",
                            "display_name": "# of Events"
                        },
                        {
                            "desc": {
                                "root": {
                                    "type": "root",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "format": "",
                                            "indent": 0,
                                            "version": 1,
                                            "children": [
                                                {
                                                    "mode": "normal",
                                                    "text": "Total Number of Disasters recorded but not identified as a declared disaster by FEMA",
                                                    "type": "text",
                                                    "style": "",
                                                    "detail": 0,
                                                    "format": 0,
                                                    "version": 1
                                                }
                                            ],
                                            "direction": "ltr"
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            },
                            "name": "distinct CASE WHEN disaster_number = 'Non-Declared' THEN event_id ELSE null END as num_non_declared_disasters",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "defaultFn": "Count",
                            "display_name": "# of Non-Declared Disasters"
                        },
                        {
                            "name": "substring(geoid,1,5) AS county",
                            "type": "string",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "defaultFn": "List",
                            "meta_lookup": "{\"view_id\": 750, \"filter\": {\"year\": [2020], \"length(geoid)\": [5]}, \"geoAttribute\": \"geoid\", \"keyAttribute\":\"geoid\",\"valueAttribute\":\"formatted_name\",\"attributes\": [\"geoid\",\"formatted_name\"]}",
                            "display_name": "County"
                        },
                        {
                            "name": "substring(geoid, 1, 2) as state",
                            "type": "string",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "defaultFn": "List",
                            "meta_lookup": "{\"view_id\": 750, \"filter\": {\"year\": [2020], \"length(geoid)\": [2]}, \"geoAttribute\": \"geoid\", \"keyAttribute\":\"geoid\",\"attributes\": [\"geoid\",\"name\"]}",
                            "display_name": "State"
                        },
                        {
                            "name": "EXTRACT(YEAR from coalesce(swd_begin_date, fema_incident_begin_date)) as fusion_year",
                            "type": "integer",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "display_name": "Fusion Year"
                        },
                        {
                            "name": "case when disaster_number = 'Non-Declared' then 'Non-Declared' else 'Declared' end as fusion_disaster_category",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "display_name": "Fusion Disaster Category"
                        },
                        {
                            "name": "EXTRACT(MONTH from coalesce(swd_begin_date, fema_incident_begin_date)) as fusion_month",
                            "type": "string",
                            "origin": "calculated-column",
                            "display": "meta-variable",
                            "meta_lookup": "{ \"1\":\"Jan\", \"2\":\"Feb\", \"3\":\"Mar\", \"4\":\"April\", \"5\":\"May\", \"6\":\"Jun\", \"7\":\"Jul\", \"8\":\"Aug\", \"9\":\"Sep\", \"10\":\"Oct\", \"11\":\"Nov\", \"12\":\"Dec\"}",
                            "display_name": "Fusion Month"
                        },
                        {
                            "name": "COALESCE(fusion_property_damage, 0) + COALESCE(fusion_crop_damage, 0) + COALESCE(swd_population_damage_value, 0) as fusion_total_damage_with_pop",
                            "type": "number",
                            "origin": "calculated-column",
                            "display": "data-variable",
                            "isDollar": true,
                            "defaultFn": "Sum",
                            "display_name": "Total Fusion Damage (with Population)"
                        }
                    ]
                }
            },
            "categories": {
                "$type": "atom",
                "value": [
                    [
                        "Cenrep"
                    ],
                    [
                        "Fusion"
                    ],
                    [
                        "MitigateNY"
                    ],
                    [
                        "AVAIL"
                    ],
                    [
                        "SHMP"
                    ],
                    [
                        "Risk"
                    ]
                ]
            },
            "type": "fusion"
        },
        "activeView": {
            "view_id": 1648,
            "source_id": 870,
            "version": "AVAIL - Fusion Events V2 (12/10/2024)",
            "metadata": {
                "$type": "atom",
                "value": {
                    "tiles": {
                        "layers": [
                            {
                                "id": "s870_v1648_tPoint",
                                "type": "circle",
                                "paint": {
                                    "circle-color": "#B42222",
                                    "circle-radius": 4
                                },
                                "source": "fusion",
                                "source-layer": "view_1648"
                            }
                        ],
                        "sources": [
                            {
                                "id": "fusion",
                                "source": {
                                    "type": "vector",
                                    "tiles": [
                                        "https://graph.availabs.org/dama-admin/hazmit_dama/tiles/1648/{z}/{x}/{y}/t.pbf"
                                    ],
                                    "format": "pbf"
                                }
                            }
                        ]
                    },
                    "download": {
                        "CSV": "$HOST/files/hazmit_dama_1648/AVAIL - Fusion Events V2_1648_AVAIL - Fusion Events V2 (12/10/2024).csv.zip",
                        "GPKG": "$HOST/files/hazmit_dama_1648/AVAIL - Fusion Events V2_1648_AVAIL - Fusion Events V2 (12/10/2024).gpkg.zip",
                        "GeoJSON": "$HOST/files/hazmit_dama_1648/AVAIL - Fusion Events V2_1648_AVAIL - Fusion Events V2 (12/10/2024).geojson.zip",
                        "ESRI Shapefile": "$HOST/files/hazmit_dama_1648/AVAIL - Fusion Events V2_1648_AVAIL - Fusion Events V2 (12/10/2024).zip"
                    }
                }
            }
        },
        "activeGraphType": {
            "type": "Bar Graph",
            "GraphComp": "BarGraph"
        },
        "xAxisColumn": {
            "desc": {
                "root": {
                    "type": "root",
                    "format": "",
                    "indent": 0,
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "mode": "normal",
                                    "text": "Hazard name - Avalanche, Earthquake, etc.",
                                    "type": "text",
                                    "style": "",
                                    "detail": 0,
                                    "format": 0,
                                    "version": 1
                                }
                            ],
                            "direction": "ltr"
                        }
                    ],
                    "direction": "ltr"
                }
            },
            "name": "nri_category",
            "type": "string",
            "display": "meta-variable",
            "defaultFn": "List",
            "meta_lookup": "{ \"coldwave\":\"Extreme Cold\", \"hail\":\"Hail\", \"avalanche\":\"Avalanche\", \"coastal\":\"Coastal Hazards\", \"drought\":\"Drought\", \"earthquake\":\"Earthquake\", \"heatwave\":\"Extreme Heat\", \"hurricane\":\"Hurricane\", \"icestorm\":\"Ice Storm\", \"landslide\":\"Landslide\", \"lightning\":\"Lightning\", \"riverine\":\"Flooding\", \"tornado\":\"Tornado\", \"tsunami\":\"Tsunami/Seiche\", \"volcano\":\"Volcano\", \"wildfire\":\"Wildfire\", \"wind\":\"Wind\", \"winterweat\":\"Snowstorm\" }",
            "display_name": "NRI Category",
            "sortMethod": "descending"
        },
        "yAxisColumns": [
            {
                "desc": {
                    "root": {
                        "type": "root",
                        "format": "",
                        "indent": 0,
                        "version": 1,
                        "children": [
                            {
                                "type": "paragraph",
                                "format": "",
                                "indent": 0,
                                "version": 1,
                                "children": [
                                    {
                                        "mode": "normal",
                                        "text": "Total damage in dollars to both property and crops from the combined and synthesized data of FEMA and NCEI",
                                        "type": "text",
                                        "style": "",
                                        "detail": 0,
                                        "format": 0,
                                        "version": 1
                                    }
                                ],
                                "direction": "ltr"
                            }
                        ],
                        "direction": "ltr"
                    }
                },
                "name": "fusion_total_damage",
                "type": "number",
                "display": "data-variable",
                "isDollar": true,
                "defaultFn": "Sum",
                "display_name": "Total Fusion Damage",
                "aggMethod": "AVG"
            }
        ],
        "graphFormat": {
            "title": {
                "title": "title text",
                "position": "start",
                "fontSize": 34,
                "fontWeight": "lighter"
            },
            "description": "",
            "bgColor": "#ffffff",
            "textColor": "#000000",
            "colors": {
                "type": "palette",
                "value": [
                    "#8dd3c7",
                    "#ffffb3",
                    "#bebada",
                    "#fb8072",
                    "#80b1d3",
                    "#fdb462",
                    "#b3de69",
                    "#fccde5",
                    "#d9d9d9",
                    "#bc80bd",
                    "#ccebc5",
                    "#ffed6f"
                ]
            },
            "height": 300,
            "margins": {
                "marginTop": 21,
                "marginRight": 22,
                "marginBottom": 52,
                "marginLeft": 101
            },
            "xAxis": {
                "label": "x axis label",
                "rotateLabels": true,
                "showGridLines": true,
                "tickSpacing": 2
            },
            "yAxis": {
                "label": "y axis label",
                "showGridLines": true,
                "tickFormat": "Integer",
                "rotateLabels": true
            },
            "legend": {
                "show": true,
                "label": "legend label",
                "width": 300,
                "height": 50
            },
            "tooltip": {
                "show": true,
                "fontSize": 12
            }
        },
        "filters": [
            {
                "column": {
                    "desc": {
                        "root": {
                            "type": "root",
                            "format": "",
                            "indent": 0,
                            "version": 1,
                            "children": [
                                {
                                    "type": "paragraph",
                                    "format": "",
                                    "indent": 0,
                                    "version": 1,
                                    "children": [
                                        {
                                            "mode": "normal",
                                            "text": "Year disaster occurred",
                                            "type": "text",
                                            "style": "",
                                            "detail": 0,
                                            "format": 0,
                                            "version": 1
                                        }
                                    ],
                                    "direction": "ltr"
                                }
                            ],
                            "direction": "ltr"
                        }
                    },
                    "name": "EXTRACT(YEAR from swd_begin_date) as year_of_event",
                    "type": "string",
                    "origin": "calculated-column",
                    "display": "meta-variable",
                    "display_name": "Year of Event"
                },
                "type": "includes",
                "values": [
                    "1996",
                    "1997",
                    "1998",
                    "1999",
                    "2000",
                    "2001",
                    "2003",
                    "2004",
                    "2010",
                    "2011",
                    "2022",
                    "2023"
                ]
            }
        ],
        "externalFilters": [
            {
                "column": {
                    "desc": null,
                    "name": "geoid",
                    "type": "string",
                    "display": "geoid-variable"
                },
                "values": [
                    "28123"
                ]
            }
        ],
        "category": null,
        "checkForRefresh": false
    }
}