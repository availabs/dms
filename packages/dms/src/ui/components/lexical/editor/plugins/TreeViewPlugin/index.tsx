/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {TreeView} from '@lexical/react/LexicalTreeView';
import * as React from 'react';
import theme from '../../themes/PlaygroundEditorTheme';

export default function TreeViewPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  return (
    <TreeView
      viewClassName={theme.treeViewOutput || "tree-view-output"}
      treeTypeButtonClassName={theme.debugTreetypeButton || "debug-treetype-button"}
      timeTravelPanelClassName={theme.debugTimetravelPanel.base || "debug-timetravel-panel"}
      timeTravelButtonClassName={theme.debugTimetravelButton || "debug-timetravel-button"}
      timeTravelPanelSliderClassName={theme.debugTimetravelPanel.slider || "debug-timetravel-panel-slider"}
      timeTravelPanelButtonClassName={theme.debugTimetravelPanel.button || "debug-timetravel-panel-button"}
      editor={editor}
    />
  );
}
