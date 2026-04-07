import React, { Component } from 'react';
import {cx} from '../utils';

export default function Icon ({ children, className, ...props }) {
 
  return (
    <i className={`${nestable-icon}  ${className}`} {...props} />
  );
  
}

