import inflection from "inflection";
import type { OpenAPIV2 } from "openapi-types";
import { Field } from "../Field.js";
import { Operation } from "../Operation.js";
import type { OperationType } from "../Operation.js";
import { Parameter } from "../Parameter.js";
import getType from "../openapi3/getType.js";
import { Resource } from "../Resource.js";
import getResourcePaths from "../utils/getResources.js";

export function removeTrailingSlash(url: string): string {
  if (url.endsWith("/")) {
    return url.slice(0, -1);
  }
  return url;
}

function buildOperationFromPathItem(
  httpMethod: `${OpenAPIV2.HttpMethods}`,
  operationType: OperationType,
  pathItem: OpenAPIV2.OperationObject,
): Operation {
  return new Operation(pathItem.summary || operationType, operationType, {
    method: httpMethod.toUpperCase(),
    deprecated: !!pathItem.deprecated,
  });
}

export default function handleJson(
  response: OpenAPIV2.Document,
  entrypointUrl: string,
): Resource[] {
  const paths = getResourcePaths(response.paths);

  const resources: Resource[] = [];

  for (const path of paths) {
    const splittedPath = removeTrailingSlash(path).split("/");
    const baseName = splittedPath[splittedPath.length - 2];
    if (!baseName) {
      throw new Error("Invalid path: " + path);
    }

    const name = inflection.pluralize(baseName);
    const url = `${removeTrailingSlash(entrypointUrl)}/${name}`;

    const title = inflection.classify(baseName);

    if (!response.definitions) {
      throw new Error(); // @TODO
    }

    const definition = response.definitions[title];

    if (!definition) {
      throw new Error(); // @TODO
    }

    const { description = "", properties } = definition;

    if (!properties) {
      throw new Error(); // @TODO
    }

    const requiredFields = response.definitions?.[title]?.required ?? [];

    const fields = Object.entries(properties).map(
      ([fieldName, property]) =>
        new Field(fieldName, {
          id: null,
          range: null,
          type: getType(
            typeof property?.type === "string" ? property.type : "",
            property?.["format"] ?? "",
          ),
          enum: property.enum
            ? Object.fromEntries(
                property.enum.map((enumValue: string | number) => [
                  typeof enumValue === "string"
                    ? inflection.humanize(enumValue)
                    : enumValue,
                  enumValue,
                ]),
              )
            : null,
          reference: null,
          embedded: null,
          required: requiredFields.some((value) => value === fieldName),
          description: property.description || "",
        }),
    );

    const resource = new Resource(name, url, {
      id: null,
      title,
      description,
      fields,
      readableFields: fields,
      writableFields: fields,
      parameters: [],
      // oxlint-disable-next-line prefer-await-to-then
      getParameters: () => Promise.resolve([]),
    });

    const pathItem = response.paths[path];
    const showOperation = pathItem.get;
    const putOperation = pathItem.put;
    const patchOperation = pathItem.patch;
    const deleteOperation = pathItem.delete;
    const pathCollection = response.paths[`/${name}`];
    const listOperation = pathCollection && pathCollection.get;
    const createOperation = pathCollection && pathCollection.post;
    resource.operations = [
      ...(showOperation
        ? [buildOperationFromPathItem("get", "show", showOperation)]
        : []),
      ...(putOperation
        ? [buildOperationFromPathItem("put", "edit", putOperation)]
        : []),
      ...(patchOperation
        ? [buildOperationFromPathItem("patch", "edit", patchOperation)]
        : []),
      ...(deleteOperation
        ? [buildOperationFromPathItem("delete", "delete", deleteOperation)]
        : []),
      ...(listOperation
        ? [buildOperationFromPathItem("get", "list", listOperation)]
        : []),
      ...(createOperation
        ? [buildOperationFromPathItem("post", "create", createOperation)]
        : []),
    ];

    if (listOperation && listOperation.parameters) {
      resource.parameters = listOperation.parameters.map(
        (parameter) =>
          new Parameter(
            parameter.name,
            parameter.type ? getType(parameter.type, parameter.format) : null,
            parameter.required || false,
            parameter.description || "",
            parameter.deprecated,
          ),
      );
    }

    resources.push(resource);
  }

  return resources;
}
