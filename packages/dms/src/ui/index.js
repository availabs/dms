import React from "react";
import Layout from './components/Layout';
import LayoutGroup from './components/LayoutGroup'
import SideNav from './components/SideNav';
import Logo from './components/Logo';
import TopNav from './components/TopNav';
import Icon from './components/Icon';
import Button from './components/Button';
import ButtonSelect from './components/ButtonSelect';
import Label from './components/Label';
import Pill from './components/Pill';
import FieldSet from './components/FieldSet.jsx';
import Switch from './components/Switch';
import ColorPicker from "./components/Colorpicker";
import Tabs from "./components/Tabs";
import Drawer from "./components/Drawer";
import Input from "./components/Input"
import Textarea from "./components/Textarea"
import Dialog from "./components/Dialog";
import Modal from "./components/Modal";
import {DeleteModal} from "./components/DeleteModal";
import DraggableNav from "./components/draggableNav";
import DraggableMenu from "./components/nestableInHouse";
import Permissions from "./components/Permissions";
//import DraggableNavOld from "./components/nestable/draggableNav";
import Pagination from "./components/Pagination";
import Table from "./components/table";
import Card from "./components/Card";
import Graph from "./components/graph";
import NavigableMenu from "./components/navigableMenu";
import DraggableList from "./components/DraggableList";
import Popup from "./components/Popup";
import DndList from "./components/DndList";
import ColumnTypes from "./columnTypes/index.jsx";
import { MultiSelectEdit as MultiSelect } from "./components/MultiSelect";

import AvlGraph from "./components/graph_new"

const UI = {
	// --- Layout
	Layout,
	LayoutGroup,
	SideNav,
	TopNav,
	Logo,
	// --- Navigation
    NavigableMenu,
	DraggableNav,
	DraggableMenu,
	DraggableList,

	// --- Utilities
	Icon,
	Button,
  ButtonSelect,
	Dialog,
	Label,
	Pill,
  Popup,
  DndList,

	// --- Forms
	FieldSet,
	Switch,
	Input,
  Textarea,
	MultiSelect,
	ColorPicker,
	Tabs,
	Drawer,
	Modal,
	DeleteModal,

	// -- Data Components
	Pagination,
	Table,
	Card,
	Graph,

	// -- Auth
	Permissions,

  // ------ component modes: {EditComp, ViewComp}
  ColumnTypes,

  AvlGraph
}

//console.log('UI - index - UI', UI, columnTypes)
export default UI;
