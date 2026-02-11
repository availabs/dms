import React from "react"

export const MapEditorContext = React.createContext();

export const useMapEditorContext = () => {
	return React.useContext(MapEditorContext);
}