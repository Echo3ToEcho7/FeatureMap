window.console = window.console || { log: function () {}, dir: function () {} };

Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    mixins: {
        observable: 'Ext.util.Observable',
        maskable: 'Rally.ui.mask.Maskable'
    },

    scopeType: 'release',
    componentCls: 'app',
    settingsScope: 'workspace',

    config: {
      defaultSettings: {
        storyCardsPerColumn: 5,
        storyCardWidth: 200
      }
    },

    stories: null,
    features: null,
    initiatives: null,


    layout: {
      type: 'vbox'
    },

    constructor: function (config) {
      this.callParent([config]);
      this.mixins.observable.constructor.call(this, config);
      //this.mixins.maskable.constructor.call(this, {maskMsg: 'Loading...'});

      this.addEvents('load');

      this.cardTemplate = new Ext.XTemplate(
        '<tpl if="color != null">',
          '<div class="card {type} state-{state}" style=\'border-top: solid 8px {color}\'>',
        '<tpl else>',
          '<div class="card {type} state-{state}">',
        '</tpl>',
          '<p class="name">{name}</p>',
          '<tpl if="size"><p class="size">{size} SP</p></tpl>',
        '</div>'
      );
    },

    getSettingsFields: function () {
      return [{
        name: 'storyCardsPerColumn',
        label: 'Story Cards per Column',
        xtype: 'rallynumberfield'
      }, {
        name: 'storyCardWidth',
        label: 'Width of each Story Card',
        xtype: 'rallynumberfield'
      }];
    },

    addContent: function(tb) {
      var me = this;

      me.on('load', function (projects, initiatives, features, stories) {
        console.log('loaded');
        me._onLoad(projects, initiatives, features, stories);
      });

      me.onScopeChange(tb);
    },

    onScopeChange: function (tb) {
      var me = this;
      console.log('Scope changed');

      me.initiatives = null;
      me.features = null;
      me.stories = null;
      me.projects = null;

      me.removeAll(true);
      me.loadData(tb);
    },

    loadData: function (tb) {
      var me = this;

      me.showMask();

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'PortfolioItem/Feature',
        fetch: ['FormattedID', 'Name', 'Value', 'Parent', 'Project', 'UserStories', 'Children', 'PreliminaryEstimate', 'DirectChildrenCount', 'LeafStoryPlanEstimateTotal'],
        filters: tb.getQueryFilter(),
        listeners: {
          load: me._featuresLoaded,
          scope: me
        }
      }).load();

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'HierarchicalRequirement',
        fetch: ['FormattedID', 'Name', 'ScheduleState', 'PlanEstimate', 'Feature', 'Parent', 'Project', 'Blocked', 'BlockedReason'],
        filters: [{
          property: 'Feature.Release.Name',
          value: tb.getRecord().get('Name')
        }, {
          property: 'Feature.Release.ReleaseStartDate',
          value: tb.getRecord().raw.ReleaseStartDate
        }, {
          property: 'Feature.Release.ReleaseDate',
          value: tb.getRecord().raw.ReleaseDate
        }, {
          property: 'DirectChildrenCount',
          value: 0
        }],
        listeners: {
          load: me._storiesLoaded,
          scope: me
        }
      }).load();

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'Project',
        fetch: true,
        listeners: {
          load: me._projectsLoaded,
          scope: me
        }
      }).load();
    },

    _projectsLoaded: function (store, recs, success) {
      var me      = this;
      me.projects = {};

      Ext.Array.each(recs, function (elt) {
        me.projects[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _featuresLoaded: function (store, recs, success) {
      var initiatives = {};
      var query       = [];
      var me          = this;

      me.features     = {};

      Ext.Array.each(recs, function(elt) {
        if (elt.get('Parent')) {
          initiatives[Rally.util.Ref.getOidFromRef(elt.get('Parent')._ref)] = 1;
        }
        me.features[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      Ext.Object.each(initiatives, function(key) {
        query.push({property: 'ObjectID', operator: '=', value: key});
      });

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'PortfolioItem/Initiative',
        filters: Rally.data.QueryFilter.or(query),
        fetch: ['FormattedID', 'Name', 'PreliminaryEstimate', 'Value', 'Children', 'Project', 'DisplayColor'],
        listeners: {
          load: me._initiativesLoaded,
          scope: me
        }
      }).load();

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _storiesLoaded: function (store, recs, success) {
      var me     = this;
      me.stories = {};

      Ext.Array.each(recs, function(elt) {
        me.stories[parseInt(elt.get('ObjectID') + '', 10)] = elt;

      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _initiativesLoaded: function (store, recs, success) {
      var me         = this;
      me.initiatives = {};

      Ext.Array.each(recs, function(elt) {
        me.initiatives[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _onLoad: function (projects, initiatives, features, stories) {
      var me = this;

      me.hideMask();
      console.log(me);

      me.projectByStory      = {};
      me.projectByFeature    = {};
      me.projectByInitiative = {};

      me.storyByProject      = {};
      me.featureByProject    = {};
      me.initiativeByProject = {};

      Ext.Object.each(stories, function (oid, story) {
        var featureOid    = Rally.util.Ref.getOidFromRef(story.get('Feature')._ref);
        var initiativeOid = Rally.util.Ref.getOidFromRef(features[featureOid].get('Parent')._ref);
        var projectOid    = Rally.util.Ref.getOidFromRef(story.get('Project')._ref);

        oid           = parseInt(oid + '', 10);
        featureOid    = parseInt(featureOid + '', 10);
        initiativeOid = parseInt(initiativeOid + '', 10);
        projectOid    = parseInt(projectOid + '', 10);

        me.projectByStory[oid]                = projectOid;
        me.projectByFeature[featureOid]       = projectOid;
        me.projectByInitiative[initiativeOid] = projectOid;

        me.storyByProject[projectOid]      = me.storyByProject[projectOid] || {};
        me.featureByProject[projectOid]    = me.featureByProject[projectOid] || {};
        me.initiativeByProject[projectOid] = me.initiativeByProject[projectOid] || {};

        me.storyByProject[projectOid][oid]                = 1;
        me.featureByProject[projectOid][featureOid]       = 1;
        me.initiativeByProject[projectOid][initiativeOid] = 1;
      });

      Ext.Object.each(me.storyByProject, function (projectId, stories) {
        console.log('Adding project', projectId, me.projects[projectId].get('Name'));
        me.add(me.addProject(projectId));
      });
    },

    addProject: function (projectId) {
      var me = this;

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox',
          align: 'stretchmax'
        },
        items: [{
          xtype: 'box',
          cls: 'rotate-parent',
          html: '<div class="rotate">' + me.projects[projectId].get('Name') + '</div>'
        }]
      });

      Ext.Object.each(me.initiativeByProject[projectId], function (initiativeId) {
        container.add(me.addInitiative(projectId, initiativeId));
      });

      return container;
    },

    addInitiative: function (projectId, initiativeId) {
      var me = this;
      var data = {};
      var iid;

      console.log('Initiative', initiativeId, me.initiatives[initiativeId]);
      data.type = 'initiative';
      data.name = me.initiatives[initiativeId].get('Name');
      //data.size = me.initiatives[initiativeId].get('PreliminaryEstimate').Value;

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'vbox',
          align: 'stretch'
        },
        items: [{
          xtype: 'box',
          html: me.cardTemplate.apply(data)
        }]
      });

      var featureContainer = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        }
      });

      container.add(featureContainer);

      Ext.Object.each(me.featureByProject[projectId], function (featureId) {
        if (!me.features[featureId].get('Parent')) {
          return;
        }

        iid = Rally.util.Ref.getOidFromRef(me.features[featureId].get('Parent')._ref) + '';

        if (initiativeId === iid) {
          featureContainer.add(me.addFeature(projectId, initiativeId, featureId));
        }
      });

      return container;
    },

    addFeature: function (projectId, initiativeId, featureId) {
      var me      = this;
      var i       = 0;
      var spc     = parseInt(me.getSetting('storyCardsPerColumn') + '', 10);
      var bgColor = me.initiatives[initiativeId].get('DisplayColor');
      var data    = {};
      var storyContainer;
      var storyColumnContainer;

      data.type  = 'feature';
      data.name  = me.features[featureId].get('Name');
      data.size  = me.features[featureId].get('LeafStoryPlanEstimateTotal') || me.features[featureId].get('PreliminaryEstimate').Value;
      data.color = bgColor;

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'vbox',
          align: 'stretch'
        },
        items: [{
          xtype: 'box',
          html: me.cardTemplate.apply(data)
        }]
      });

      storyContainer = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        }
      });

      container.add(storyContainer);

      Ext.Object.each(me.storyByProject[projectId], function (storyId) {
        var parentId = Rally.util.Ref.getOidFromRef(me.stories[storyId].get('Feature')._ref);

        if (parseInt(featureId + '', 10) !== parseInt(parentId + '', 10)) {
          return;
        }

        if (i >= spc) {
          i = 0;
        }

        if (i === 0) {
          storyColumnContainer = Ext.create('Ext.container.Container', {
            layout: {
              type: 'vbox'
            }
          });

          storyContainer.add(storyColumnContainer);
        }

        storyColumnContainer.add(me.addStory(storyId));
        i++;
      });

      return container;
    },

    addStory: function (storyId) {
      var me   = this;
      var data = {
        name:  me.stories[storyId].get('Name'),
        size:  me.stories[storyId].get('PlanEstimate'),
        state: ('' + me.stories[storyId].get('ScheduleState')).toLowerCase(),
        type:  'story'
      };

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        },
        //style: {
            //border: '1px solid black',
        //},
        items: [{
          xtype: 'box',
          //cls: 'rotate',
          //style: {
            //'margin-bottom': '20px',
            //'margin-right': '20px'
          //},
          html: me.cardTemplate.apply(data)
        }]
      });

      return container;
    }

});
