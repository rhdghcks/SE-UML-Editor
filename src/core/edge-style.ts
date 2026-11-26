import type { ClassConnector, MessageArrow } from './types';

export interface EdgeStyle {
  type: 'line' | 'dashed';
  marker: 'arrow' | 'triangle' | 'diamond' | 'none';
  markerFill: boolean;
  markerPosition: 'start' | 'end';
}

//export type ClassConnector = '<|--' | '--|>' | '*--' | 'o--' | '-->' | '--' | '..>' | '..|>';
export function getEdgeStyle_ClassDiagram(connector: ClassConnector): EdgeStyle {
  switch (connector) {
    case '<|--':
      return {
        type: 'line', marker: 'triangle',
        markerFill: false, markerPosition: 'start'
      };

    case '--|>':
      return {
        type: 'line', marker: 'triangle',
        markerFill: false, markerPosition: 'end'
      };

    case '*--':
      return {
        type: 'line', marker: 'diamond',
        markerFill: true, markerPosition: 'start'
      };

    case 'o--':
      return {
        type: 'line', marker: 'diamond',
        markerFill: false, markerPosition: 'start'
      };

    case '-->':
      return {
        type: 'line', marker: 'arrow',
        markerFill: true, markerPosition: 'end'
      };

    case '--':
      return {
        type: 'line', marker: 'none',
        markerFill: false, markerPosition: 'end'
      };

    case '..>':
      return {
        type: 'dashed', marker: 'arrow',
        markerFill: true, markerPosition: 'end'
      };

    case '..|>':
      return {
        type: 'dashed', marker: 'triangle',
        markerFill: false, markerPosition: 'end'
      };

  }
}

//export type MessageArrow = '->>' | '-->>' | '->' | '-->';
export function getEdgeStyle_SequenceDiagram(
  connector: MessageArrow
): EdgeStyle {
  switch (connector) {
    case '->>':
      return {
        type: 'line', marker: 'triangle',
        markerFill: true, markerPosition: 'end'
      };

    case '-->>':
      return {
        type: 'dashed', marker: 'triangle',
        markerFill: true, markerPosition: 'end'
      };

    case '->':
      return {
        type: 'line', marker: 'none',
        markerFill: false, markerPosition: 'end'
      };

    case '-->':
      return {
        type: 'dashed', marker: 'none',
        markerFill: false, markerPosition: 'end'
      };
  }
}