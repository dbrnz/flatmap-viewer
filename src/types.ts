/*==============================================================================

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2024  David Brooks

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

==============================================================================*/

export type Constructor<T> = new(...args: any[]) => T

//==============================================================================

export type ScalarType = boolean | number | string

export type PropertyKey = string
export type PropertyValue = ScalarType | ScalarType[]

export type PropertiesType = Record<PropertyKey, PropertyValue>

//==============================================================================

