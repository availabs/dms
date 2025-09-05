import React from "react";
import Layout from './components/Layout';
import SideNav from './components/SideNav';
import Logo from './components/Logo';
import SideNavContainer from "./components/SideNavContainer";
import TopNav from './components/TopNav';
import Icon from './components/Icon';
import Button from './components/Button';
import ButtonSelect from './components/ButtonSelect';
import Label from './components/Label';
import Menu from './components/Menu';
import Popover from './components/Popover';
import Pill from './components/Pill';
import FieldSet from './components/FieldSet.jsx';
import Switch from './components/Switch';
import ColorPicker from "./components/Colorpicker";
import Tabs from "./components/Tabs";
import Drawer from "./components/Drawer";
import Input from "./components/Input"
import Textarea from "./components/Textarea"
import Select from './components/Select';
import Dialog from "./components/Dialog";
import Dropdown from "./components/Dropdown";
import Modal from "./components/Modal";
import {DeleteModal} from "./components/DeleteModal";
import DraggableNav from "./components/nestable/draggableNav";
import Pagination from "./components/Pagination";
import Table from "./components/table";
import Card from "./components/Card";
import Graph from "./components/graph";
import Listbox from "./components/Listbox";
import ColumnTypes from "./columnTypes/index.jsx"

//console.log('UI start - columnTpces', columnTypes)
const UI = {
	// --- Layout
	Layout,
	Logo,
	SideNavContainer,
	// --- Navigation
	Menu,
	SideNav,
	TopNav,
  // Nestable,
	DraggableNav,
	// --- Utilities
	Icon,
	Button,
  ButtonSelect,
	Dialog,
	Label,
	Popover,
	Pill,

	// --- Forms
	FieldSet,
	Switch,
	Input,
  Textarea,
	Select,
	ColorPicker,
	Tabs,
	Drawer,
	Dropdown,
	Modal,
	DeleteModal,

	// -- Data Components
	Pagination,
	Table,
	Card,
	Graph,
  Listbox,

  // ------ component modes: {EditComp, ViewComp}
  ColumnTypes
}

//console.log('UI - index - UI', UI, columnTypes)
export default UI;
