export const getThemeOptions = (themeNames) => {
  return {
    "settings": {
      "theme": {
        "label": "Theme",
        "defaultOpen": true,
        "controls": {
          "theme": {
            "label": "Theme",
            "type": "select",
            "options": themeNames
          }
        }
      }
    },
    "navOptions": {
      "topNav": {
        "label": "Top Nav",
        "defaultOpen": true,
        "controls": {
          "size": {
            "label": "Size",
            "type": "select",
            "options": [
              "none",
              "compact"
            ]
          },
          "logo": {
            "label": "Logo",
            "type": "select",
            "options": [
              "none",
              "left",
              "right"
            ]
          },
          "search": {
            "label": "Search",
            "type": "select",
            "options": [
              "none",
              "left",
              "right"
            ]
          },
          "dropdown": {
            "label": "Menu",
            "type": "select",
            "options": [
              "none",
              "left",
              "right"
            ]
          },
          "nav": {
            "label": "Navigation",
            "type": "select",
            "options": [
              "none",
              "main",
              "secondary"
            ]
          }
        }
      },
      "sideNav": {
        "label": "Side Nav",
        "defaultOpen": false,
        "controls": {
          "size": {
            "label": "Size",
            "type": "select",
            "options": [
              "none",
              "micro",
              "mini",
              "compact",
              "full"
            ]
          },
          "depth": {
            "label": "Depth",
            "type": "select",
            "options": [
              1,
              2,
              3
            ]
          },
          "logo": {
            "label": "Logo",
            "type": "select",
            "options": [
              "none",
              "top",
              "bottom"
            ]
          },
          "search": {
            "label": "Search",
            "type": "select",
            "options": [
              "none",
              "top",
              "bottom"
            ]
          },
          "dropdown": {
            "label": "Menu",
            "type": "select",
            "options": [
              "none",
              "top",
              "bottom"
            ]
          },
          "nav": {
            "label": "Navigation",
            "type": "select",
            "options": [
              "none",
              "main",
              "secondary"
            ]
          }
        }
      },
      "secondaryNav": {
        "label": "Secondary Nav",
        "defaultOpen": false,
        "controls": {
          "navItems": {
            "label": "Nav Items",
            "type": "menu"
          }
        }
      },
      "authMenu": {
        "label": "Auth Menu",
        "defaultOpen": false,
        "controls": {
          "navItems": {
            "label": "Nav Items",
            "type": "menu"
          }
        }
      }
    }
  }
}
