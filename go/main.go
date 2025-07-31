package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hola, mundo!")
}

func main() {
	http.HandleFunc("/", handler)
	http.ListenAndServe(":8080", nil)
}

type HttpContext struct {
	res http.ResponseWriter
	req *http.Request
}

func (c *HttpContext) SetHeader(key, value string) {
}

type Handler struct {
	Method string
	Path   string
	Fn     func(ctx *HttpContext) any
}
