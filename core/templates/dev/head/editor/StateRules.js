// Copyright 2014 The Oppia Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Controllers for rules corresponding to a state's interaction.
 *
 * @author sll@google.com (Sean Lip)
 */

// A state-specific cache for interaction handlers. It stores handlers
// corresponding to an interaction id so that they can be restored if the
// interaction is changed back while the user is still in this state. This
// cache should be reset each time the state editor is initialized.
oppia.factory('interactionHandlersCache', [function() {
  var _cache = {};
  return {
    reset: function() {
      _cache = {};
    },
    contains: function(interactionId) {
      return _cache.hasOwnProperty(interactionId);
    },
    set: function(interactionId, interactionHandlers) {
      _cache[interactionId] = angular.copy(interactionHandlers);
    },
    get: function(interactionId) {
      if (!_cache.hasOwnProperty(interactionId)) {
        return null;
      }
      return angular.copy(_cache[interactionId]);
    }
  };
}]);


oppia.factory('rulesService', [
    'stateInteractionIdService', 'INTERACTION_SPECS', 'interactionHandlersCache',
    'editorContextService', 'changeListService', 'explorationStatesService', 'graphDataService',
    'warningsData',
    function(
      stateInteractionIdService, INTERACTION_SPECS, interactionHandlersCache,
      editorContextService, changeListService, explorationStatesService, graphDataService,
      warningsData) {

  var _interactionHandlersMemento = null;
  var _activeRuleIndex = null;
  var _interactionHandlers = null;
  var _answerChoices = null;
  var _interactionHandlerSpecs = null;

  var _refreshHandlerSpecs = function() {
    if (!stateInteractionIdService.savedMemento) {
      $log.error('ERROR: Interaction id not specified.');
    }

    _interactionHandlerSpecs = INTERACTION_SPECS[
      stateInteractionIdService.savedMemento].handler_specs;
  };

  var _saveInteractionHandlers = function(newHandlers) {
    var oldHandlers = _interactionHandlersMemento;
    if (newHandlers && oldHandlers && !angular.equals(newHandlers, oldHandlers)) {
      _interactionHandlers = newHandlers;

      changeListService.editStateProperty(
        editorContextService.getActiveStateName(), 'widget_handlers',
        angular.copy(newHandlers), angular.copy(oldHandlers));

      var activeStateName = editorContextService.getActiveStateName();

      var _stateDict = explorationStatesService.getState(activeStateName);
      for (var i = 0; i < _stateDict.interaction.handlers.length; i++) {
        var handlerName = _stateDict.interaction.handlers[i].name;
        _stateDict.interaction.handlers[i].rule_specs = _interactionHandlers[handlerName];
      }
      explorationStatesService.setState(activeStateName, _stateDict);

      graphDataService.recompute();
      _interactionHandlersMemento = angular.copy(newHandlers);
    }
  };

  return {
    // The 'data' arg is a list of interaction handlers for the currently-active state.
    init: function(data) {
      interactionHandlersCache.reset();
      _refreshHandlerSpecs();

      // Stores rules as key-value pairs. For each pair, the key is the
      // corresponding handler name and the value has several keys:
      // - 'definition' (the rule definition)
      // - 'description' (the rule description string)
      // - 'dest' (the destination for this rule)
      // - 'feedback' (list of feedback given for this rule)
      // - 'param_changes' (parameter changes associated with this rule)
      _interactionHandlers = {};
      for (var i = 0; i < data.handlers.length; i++) {
        _interactionHandlers[data.handlers[i].name] = data.handlers[i].rule_specs;
      }
      interactionHandlersCache.set(
        stateInteractionIdService.savedMemento, _interactionHandlers);

      _interactionHandlersMemento = angular.copy(_interactionHandlers);
      _activeRuleIndex = 0;
    },
    onInteractionIdChanged: function(newInteractionId, callback) {
      _refreshHandlerSpecs();

      if (interactionHandlersCache.contains(newInteractionId)) {
        _interactionHandlers = interactionHandlersCache.get(newInteractionId);
      } else {
        // Preserve just the default rule, unless the new interaction id is a
        // terminal one (in which case, change its destination to be a
        // self-loop instead).
        _interactionHandlers = {
          'submit': [
            _interactionHandlers['submit'][_interactionHandlers['submit'].length - 1]
          ]
        };
        if (INTERACTION_SPECS[newInteractionId].is_terminal) {
          _interactionHandlers['submit'][0].dest = editorContextService.getActiveStateName();
        }
      }

      _saveInteractionHandlers(_interactionHandlers);
      interactionHandlersCache.set(newInteractionId, _interactionHandlers);

      _interactionHandlersMemento = angular.copy(_interactionHandlers);
      _activeRuleIndex = 0;

      if (callback) {
        callback();
      }
    },
    getActiveRuleIndex: function() {
      return _activeRuleIndex;
    },
    getAnswerChoices: function() {
      return angular.copy(_answerChoices);
    },
    changeActiveRuleIndex: function(newIndex) {
      _activeRuleIndex = newIndex;
    },
    getActiveRule: function() {
      if (_interactionHandlers) {
        return _interactionHandlers['submit'][_activeRuleIndex];
      } else {
        return null;
      }
    },
    deleteActiveRule: function() {
      if (_activeRuleIndex === _interactionHandlers.length - 1) {
        warningsData.addWarning('Cannot delete default rule.');
        return;
      }
      if (!window.confirm('Are you sure you want to delete this rule?')) {
        return;
      }
      _interactionHandlersMemento = angular.copy(_interactionHandlers);
      _interactionHandlers['submit'].splice(_activeRuleIndex, 1);
      _saveInteractionHandlers(_interactionHandlers);
      _activeRuleIndex = 0;
    },
    saveActiveRule: function(activeRule) {
      _interactionHandlers['submit'][_activeRuleIndex] = activeRule;
      _saveInteractionHandlers(_interactionHandlers);
    },
    getInteractionHandlerSpecs: function() {
      return angular.copy(_interactionHandlerSpecs);
    },
    // Updates answer choices when the interaction requires it -- for example,
    // the rules for multiple choice need to refer to the multiple choice
    // interaction's customization arguments.
    updateAnswerChoices: function(newAnswerChoices) {
      _answerChoices = newAnswerChoices;
    },
    getInteractionHandlers: function() {
      return angular.copy(_interactionHandlers);
    },
    // This registers the change to the handlers in the list of changes, and also
    // updates the states object in explorationStatesService.
    save: function(newHandlers) {
      _saveInteractionHandlers(newHandlers);
    }
  };
}]);


oppia.controller('StateRules', [
    '$scope', '$log', '$rootScope', '$modal', 'stateInteractionIdService', 'editorContextService',
    'warningsData', 'rulesService',
    function(
      $scope, $log, $rootScope, $modal, stateInteractionIdService, editorContextService,
      warningsData, rulesService) {

  $scope.getAnswerChoices = function() {
    return rulesService.getAnswerChoices();
  };
  $scope.editorContextService = editorContextService;

  $scope.changeActiveRuleIndex = function(newIndex) {
    $rootScope.$broadcast('externalSave');
    rulesService.changeActiveRuleIndex(newIndex);
    $scope.activeRuleIndex = rulesService.getActiveRuleIndex();
    $rootScope.$broadcast('activeRuleChanged');
  };

  $scope.getCurrentInteractionId = function() {
    return stateInteractionIdService.savedMemento;
  };

  $scope.$on('initializeHandlers', function(evt, data) {
    rulesService.init(data);
    $scope.interactionHandlers = rulesService.getInteractionHandlers();
    $scope.activeRuleIndex = rulesService.getActiveRuleIndex();
    $rootScope.$broadcast('activeRuleChanged');
  });

  $scope.$on('onInteractionIdChanged', function(evt, newInteractionId) {
    rulesService.onInteractionIdChanged(newInteractionId, function() {
      $scope.interactionHandlers = rulesService.getInteractionHandlers();
      $scope.activeRuleIndex = rulesService.getActiveRuleIndex();
      $rootScope.$broadcast('activeRuleChanged');
    });
  });

  $scope.$on('ruleDeleted', function(evt) {
    $scope.interactionHandlers = rulesService.getInteractionHandlers();
    $scope.activeRuleIndex = rulesService.getActiveRuleIndex();
    $rootScope.$broadcast('activeRuleChanged');
  });

  $scope.$on('ruleSaved', function(evt) {
    $scope.interactionHandlers = rulesService.getInteractionHandlers();
    $scope.activeRuleIndex = rulesService.getActiveRuleIndex();
  });

  // Updates answer choices when the interaction requires it -- for example,
  // the rules for multiple choice need to refer to the multiple choice
  // interaction's customization arguments.
  // TODO(sll): Remove the need for this watcher, or make it less ad hoc.
  $scope.$on('updateAnswerChoices', function(evt, newAnswerChoices) {
    rulesService.updateAnswerChoices(newAnswerChoices);
  });

  $scope.openAddRuleModal = function() {
    warningsData.clear();
    $rootScope.$broadcast('externalSave');

    $modal.open({
      templateUrl: 'modals/addRule',
      backdrop: true,
      resolve: {},
      controller: [
          '$scope', '$modalInstance', 'rulesService',
          function($scope, $modalInstance, rulesService) {
        $scope.currentRuleDescription = null;
        $scope.currentRuleDefinition = {
          rule_type: 'atomic',
          name: null,
          inputs: {},
          subject: 'answer'
        };

        $scope.interactionHandlerSpecs = rulesService.getInteractionHandlerSpecs();
        $scope.answerChoices = rulesService.getAnswerChoices();

        $scope.addNewRule = function() {
          $modalInstance.close({
            description: $scope.currentRuleDescription,
            definition: $scope.currentRuleDefinition
          });
        };

        $scope.cancel = function() {
          $modalInstance.dismiss('cancel');
          warningsData.clear();
        };
      }]
    }).result.then(function(tmpRule) {
      _interactionHandlersMemento = angular.copy($scope.interactionHandlers);

      // Move the tmp rule into the list of 'real' rules.
      var numRules = $scope.interactionHandlers['submit'].length;
      $scope.interactionHandlers['submit'].splice(numRules - 1, 0, {
        description: tmpRule.description,
        definition: tmpRule.definition,
        dest: editorContextService.getActiveStateName(),
        feedback: [],
        param_changes: []
      });

      rulesService.save($scope.interactionHandlers);

      $scope.changeActiveRuleIndex($scope.interactionHandlers['submit'].length - 2);
    });
  };

  $scope.RULE_LIST_SORTABLE_OPTIONS = {
    axis: 'y',
    cursor: 'move',
    handle: '.oppia-rule-sort-handle',
    items: '.oppia-sortable-rule-block',
    tolerance: 'pointer',
    start: function(e, ui) {
      $rootScope.$broadcast('externalSave');
      $scope.$apply();
      ui.placeholder.height(ui.item.height());
    },
    stop: function(e, ui) {
      $scope.$apply();
      rulesService.save($scope.interactionHandlers);
      $scope.changeActiveRuleIndex(ui.item.index());
      $rootScope.$broadcast('activeRuleChanged');
    }
  };
}]);


oppia.controller('StateEditorActiveRule', [
    '$scope', '$rootScope', 'rulesService', function($scope, $rootScope, rulesService) {

  $scope.interactionHandlers = rulesService.getInteractionHandlers();

  $scope.$on('activeRuleChanged', function() {
    $scope.activeRule = rulesService.getActiveRule();
  });

  $scope.deleteActiveRule = function() {
    rulesService.deleteActiveRule();
    $rootScope.$broadcast('ruleDeleted');
  };

  $scope.saveRule = function() {
    rulesService.saveActiveRule($scope.activeRule);
    $rootScope.$broadcast('ruleSaved');
  };
}]);
